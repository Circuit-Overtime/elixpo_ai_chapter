const DEFAULT_READ_LIMIT = 120;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export class IdempotencyError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'IdempotencyError';
    this.code = code;
    this.status = status;
  }
}

async function pruneOperationalRows(db, now) {
  try {
    await db.prepare(`
      DELETE FROM api_rate_limits WHERE rowid IN (
        SELECT rowid FROM api_rate_limits
        WHERE window_start < ? ORDER BY window_start ASC LIMIT 25
      )
    `).bind(now - 120).run();
    await db.prepare(`
      DELETE FROM api_idempotency_keys WHERE rowid IN (
        SELECT rowid FROM api_idempotency_keys
        WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT 25
      )
    `).bind(now).run();
  } catch (error) {
    console.error('[api/v1/operations] bounded cleanup failed:', error?.message || error);
  }
}

export async function consumeApiRateLimit(db, subjectId, route, limit = DEFAULT_READ_LIMIT) {
  const now = Math.floor(Date.now() / 1000);
  await pruneOperationalRows(db, now);
  const windowStart = now - (now % 60);
  const row = await db.prepare(`
    INSERT INTO api_rate_limits (subject_id, route, window_start, request_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(subject_id, route, window_start)
    DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(subjectId, route, windowStart).first();
  const used = Number(row?.request_count || 1);
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used <= limit,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(windowStart + 60),
      ...(used > limit ? { 'Retry-After': String(Math.max(1, windowStart + 60 - now)) } : {}),
    },
  };
}

export function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new IdempotencyError(
      'invalid_idempotency_key',
      'Idempotency-Key must contain between 8 and 128 characters.',
      400,
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new IdempotencyError(
      'invalid_idempotency_key',
      'Idempotency-Key contains unsupported characters.',
      400,
    );
  }
  return value;
}

export async function hashApiRequest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function beginIdempotentOperation(db, {
  userId,
  operation,
  key,
  requestHash,
  ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
}) {
  validateIdempotencyKey(key);
  if (!userId || !operation || !/^[a-f0-9]{64}$/.test(requestHash || '')) {
    throw new IdempotencyError('invalid_idempotency_request', 'The idempotent request is invalid.', 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    DELETE FROM api_idempotency_keys
    WHERE user_id = ? AND operation = ? AND idempotency_key = ? AND expires_at <= ?
  `).bind(userId, operation, key, now).run();
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO api_idempotency_keys
      (user_id, operation, idempotency_key, request_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, operation, key, requestHash, now, now + ttlSeconds).run();

  const row = await db.prepare(`
    SELECT request_hash, status_code, response_body
    FROM api_idempotency_keys
    WHERE user_id = ? AND operation = ? AND idempotency_key = ?
  `).bind(userId, operation, key).first();
  if (!row) throw new IdempotencyError('idempotency_unavailable', 'The operation could not be reserved.', 503);
  if (row.request_hash !== requestHash) {
    throw new IdempotencyError(
      'idempotency_key_reused',
      'This Idempotency-Key was already used with a different request.',
    );
  }
  if (Number.isInteger(row.status_code) && row.response_body !== null) {
    let body;
    try { body = JSON.parse(row.response_body); } catch { body = null; }
    return { state: 'replay', status: row.status_code, body };
  }
  if (!inserted?.meta?.changes) {
    throw new IdempotencyError(
      'idempotency_in_progress',
      'A request with this Idempotency-Key is already in progress.',
    );
  }
  return { state: 'started' };
}

export async function completeIdempotentOperation(db, {
  userId,
  operation,
  key,
  requestHash,
  status,
  body,
}) {
  const result = await db.prepare(`
    UPDATE api_idempotency_keys
    SET status_code = ?, response_body = ?
    WHERE user_id = ? AND operation = ? AND idempotency_key = ? AND request_hash = ?
  `).bind(status, JSON.stringify(body), userId, operation, key, requestHash).run();
  if (!result?.meta?.changes) {
    throw new IdempotencyError('idempotency_unavailable', 'The operation result could not be retained.', 503);
  }
}

export async function abandonIdempotentOperation(db, {
  userId,
  operation,
  key,
  requestHash,
}) {
  await db.prepare(`
    DELETE FROM api_idempotency_keys
    WHERE user_id = ? AND operation = ? AND idempotency_key = ?
      AND request_hash = ? AND status_code IS NULL
  `).bind(userId, operation, key, requestHash).run();
}

export async function recordApiAudit(db, event) {
  try {
    await db.prepare(`
      INSERT INTO api_audit_events
        (id, request_id, user_id, client_id, action, resource_type, resource_id, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      event.requestId,
      event.userId,
      event.clientId,
      event.action,
      event.resourceType || null,
      event.resourceId || null,
      event.outcome || 'success',
      Math.floor(Date.now() / 1000),
    ).run();
  } catch (error) {
    console.error('[api/v1/audit] write failed:', error?.message || error);
  }
}
