import { type NextRequest, NextResponse } from 'next/server';
import { getDB, getEnv, getKV } from '@/lib/db';

export const runtime = 'edge';

/**
 * POST /api/webhooks/elixpo
 *
 * Inbound webhook from Elixpo Accounts. Used to keep this service's
 * local user state consistent with the upstream identity provider —
 * specifically, hard-deleting a user's data here when they delete their
 * Elixpo Account.
 *
 * ─── Request shape (sent by accounts.elixpo) ──────────────────────────
 *
 * Headers:
 *   Content-Type:           application/json
 *   X-Elixpo-Event-Id:      <uuid>         dedupe token
 *   X-Elixpo-Timestamp:     <unix-seconds> replay window check
 *   X-Elixpo-Signature:     sha256=<hex>   HMAC of timestamp + "." + body
 *
 * Body:
 *   {
 *     "event": "user.deleted" | "user.updated",
 *     "elixpo_id": "...",
 *     "data": { "email"?: "...", "display_name"?: "...", ... }
 *   }
 *
 * ─── Verification ────────────────────────────────────────────────────
 *
 * 1. Body must parse as JSON.
 * 2. X-Elixpo-Timestamp must be within ±5 minutes of now (replay window).
 * 3. HMAC-SHA256(secret, `${timestamp}.${rawBody}`) must equal the
 *    signature header (constant-time compare).
 * 4. X-Elixpo-Event-Id must not have been seen in the last 30 minutes
 *    (idempotency — accounts.elixpo retries on 5xx).
 *
 * ─── Failure semantics ───────────────────────────────────────────────
 *
 *   401: signature / timestamp invalid
 *   400: malformed body
 *   200: duplicate (already processed) — upstream stops retrying
 *   200: unknown event type — we don't gate accounts.elixpo on knowing
 *        every receiver's event matrix
 *   500: DB error — upstream WILL retry
 *
 * Configure ELIXPO_WEBHOOK_SECRET in env (Cloudflare Pages → settings).
 * Without it set, the endpoint always returns 503 — fail-closed, no
 * silent acceptance.
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!env.ELIXPO_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook receiver not configured' },
      { status: 503 },
    );
  }

  // Verify replay window
  const tsHeader = request.headers.get('x-elixpo-timestamp');
  if (!tsHeader || !/^\d+$/.test(tsHeader)) {
    return rejectAuth('missing or invalid timestamp');
  }
  const ts = Number(tsHeader);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    return rejectAuth('timestamp outside ±5 minute window');
  }

  // Verify HMAC. Read raw body BEFORE JSON.parse so we sign the exact
  // bytes the sender signed (re-serializing after parse can subtly
  // differ on whitespace / key order).
  const rawBody = await request.text();
  const signature = request.headers.get('x-elixpo-signature') || '';
  const ok = await verifySignature(
    env.ELIXPO_WEBHOOK_SECRET,
    `${ts}.${rawBody}`,
    signature,
  );
  if (!ok) return rejectAuth('invalid signature');

  // Parse body
  let body: { event?: string; elixpo_id?: string; data?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Idempotency check
  const eventId = request.headers.get('x-elixpo-event-id');
  if (eventId) {
    const kv = getKV();
    const seen = await kv.get(`wh:elixpo:${eventId}`);
    if (seen) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
    // Mark seen for 30 min (accounts.elixpo retry window).
    await kv
      .put(`wh:elixpo:${eventId}`, '1', { expirationTtl: 1800 })
      .catch(() => {});
  }

  // Dispatch
  if (!body.event || !body.elixpo_id) {
    return NextResponse.json({ error: 'missing event or elixpo_id' }, { status: 400 });
  }

  try {
    switch (body.event) {
      case 'user.deleted':
        await handleUserDeleted(body.elixpo_id);
        return NextResponse.json({ ok: true, event: body.event });
      case 'user.updated':
        await handleUserUpdated(body.elixpo_id, body.data);
        return NextResponse.json({ ok: true, event: body.event });
      default:
        // Unknown events are accepted (200) so accounts.elixpo doesn't
        // retry forever on events this receiver doesn't care about.
        return NextResponse.json({ ok: true, ignored: body.event });
    }
  } catch (err) {
    console.error('[webhook] handler error', err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}

// ─── Event handlers ─────────────────────────────────────────────────

/**
 * Hard-delete every trace of the user. Drops:
 *   1. all clicks for any URL the user owns
 *   2. all URLs
 *   3. all API keys
 *   4. all sessions
 *   5. oauth_tokens row
 *   6. audit_log rows
 *   7. users row
 *
 * Also busts the KV caches that referenced this user's content:
 *   - session:<id>      (user is gone, future session lookups fail closed)
 *   - url:<short_code>  (redirect cache — must not 302 to a deleted link)
 *
 * Idempotent: if the user doesn't exist, returns silently. accounts.elixpo
 * doesn't need to track whether the cascade ran on our side already.
 */
async function handleUserDeleted(elixpoId: string): Promise<void> {
  const db = getDB();
  const kv = getKV();

  const user = await db
    .prepare('SELECT id FROM users WHERE elixpo_id = ?')
    .bind(elixpoId)
    .first<{ id: number }>();
  if (!user) return;

  // Collect KV keys that need busting BEFORE we drop the rows.
  const [{ results: codes }, { results: sessions }] = await Promise.all([
    db
      .prepare('SELECT short_code FROM urls WHERE user_id = ?')
      .bind(user.id)
      .all<{ short_code: string }>(),
    db
      .prepare('SELECT id FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .all<{ id: string }>(),
  ]);

  // Cascade delete — one batch, atomic.
  await db.batch([
    db
      .prepare(
        'DELETE FROM clicks WHERE url_id IN (SELECT id FROM urls WHERE user_id = ?)',
      )
      .bind(user.id),
    db.prepare('DELETE FROM urls WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM audit_log WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);

  // Fire-and-forget KV invalidation.
  const kvDeletes: Promise<unknown>[] = [];
  for (const c of codes || []) {
    kvDeletes.push(kv.delete(`url:${c.short_code}`).catch(() => {}));
  }
  for (const s of sessions || []) {
    kvDeletes.push(kv.delete(`session:${s.id}`).catch(() => {}));
  }
  await Promise.all(kvDeletes);
}

/**
 * Sync upstream profile changes (email + display name + avatar).
 * Lightweight — we don't propagate this anywhere else, just keep our
 * local mirror current so the dashboard shows the same identity the
 * user sees on accounts.elixpo.
 */
async function handleUserUpdated(
  elixpoId: string,
  data: unknown,
): Promise<void> {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;

  // Only patch fields we recognize.
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof d.email === 'string') {
    sets.push('email = ?');
    binds.push(d.email);
  }
  if (typeof d.display_name === 'string') {
    sets.push('display_name = ?');
    binds.push(d.display_name);
  }
  if (typeof d.avatar_url === 'string' || d.avatar_url === null) {
    sets.push('avatar_url = ?');
    binds.push(d.avatar_url ?? null);
  }
  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  binds.push(elixpoId);

  await getDB()
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE elixpo_id = ?`)
    .bind(...binds)
    .run();
}

// ─── HMAC verification helpers ──────────────────────────────────────

/**
 * HMAC-SHA256 compare. Uses Web Crypto so it works at the edge.
 * Constant-time on the bytes via crypto.subtle.verify — no manual
 * timing-attack-safe compare needed.
 */
async function verifySignature(
  secret: string,
  signedString: string,
  signatureHeader: string,
): Promise<boolean> {
  // Header format: "sha256=<hex>". Be lenient about prefix presence so
  // a misconfigured sender doesn't silently fail every webhook.
  const sigHex = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length !== 64) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const sigBytes = hexToBytes(sigHex);
  return crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    encoder.encode(signedString),
  );
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return buf;
}

function rejectAuth(reason: string): NextResponse {
  // Log the reason server-side; return a generic 401 to the sender so
  // probing for "which check failed?" is uninformative.
  console.warn(`[webhook] reject — ${reason}`);
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
