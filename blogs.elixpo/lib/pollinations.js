import { decryptIntegrationSecret, encryptIntegrationSecret } from './integrationSecrets.js';

export const POLLINATIONS_MODELS = Object.freeze(['gptimage', 'flux', 'klein']);
export const POLLINATIONS_CALLBACK_PATH = '/api/integrations/pollinations/callback';
const ENCRYPTION_ENV = 'POLLINATIONS_CONNECTION_ENCRYPTION_KEY';
const PROVIDER = 'https://gen.pollinations.ai';
const MEDIA_PROVIDER = 'https://media.pollinations.ai';

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pollinationsEnabled() {
  return process.env.POLLINATIONS_IMAGE_CONNECTOR_ENABLED === 'true';
}

export function randomVerifier(length = 48) {
  return base64url(crypto.getRandomValues(new Uint8Array(length)));
}

export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export async function tokenFingerprint(token) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

export function callbackUrl(origin) {
  return `${origin}${POLLINATIONS_CALLBACK_PATH}`;
}

export function authorizationUrl({ origin, state, challenge }) {
  const clientId = process.env.POLLINATIONS_APP_KEY;
  if (!clientId?.startsWith('pk_')) throw new Error('POLLINATIONS_APP_KEY is not configured');
  return `https://enter.pollinations.ai/authorize?${new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: callbackUrl(origin), scope: 'usage',
    models: POLLINATIONS_MODELS.join(','), expiry: '7', budget: '10', state,
    code_challenge: challenge, code_challenge_method: 'S256',
  })}`;
}

export async function exchangeCode({ code, verifier, origin }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, client_id: process.env.POLLINATIONS_APP_KEY || '',
    redirect_uri: callbackUrl(origin), code_verifier: verifier,
  });
  const response = await fetch('https://enter.pollinations.ai/api/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw providerError(response.status, payload.error || 'token_exchange_failed');
  return payload;
}

export function providerError(status, code = 'provider_error') {
  const error = new Error(code);
  error.providerStatus = status;
  error.code = status === 401 ? 'revoked' : status === 402 ? 'insufficient_pollen'
    : status === 403 ? 'permission_denied' : status === 429 ? 'rate_limited'
      : status >= 500 ? 'provider_unavailable' : code;
  return error;
}

async function providerGet(path, token) {
  const response = await fetch(`${PROVIDER}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000), cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw providerError(response.status);
  return payload;
}

export async function inspectPollinationsToken(token) {
  const [key, profile, balance, usage] = await Promise.all([
    providerGet('/account/key', token), providerGet('/account/profile', token),
    providerGet('/account/balance', token), providerGet('/account/usage/daily', token),
  ]);
  return { key, profile, balance, usage };
}

export async function savePollinationsConnection(db, userId, tokenResponse, inspection) {
  const now = Math.floor(Date.now() / 1000);
  const scope = String(tokenResponse.scope || '').split(/[ ,]+/).filter(Boolean);
  if (!scope.includes('usage')) throw providerError(403, 'usage_scope_required');
  const token = tokenResponse.access_token;
  const encrypted = await encryptIntegrationSecret(token, { keyEnv: ENCRYPTION_ENV });
  const fingerprint = await tokenFingerprint(token);
  const expiresAt = tokenResponse.expires_in ? now + Number(tokenResponse.expires_in) : null;
  const key = inspection.key || {};
  const profile = inspection.profile || {};
  const balanceValue = Number(inspection.balance?.balance ?? inspection.balance?.pollen ?? inspection.balance);
  await db.prepare(`
    INSERT INTO pollinations_connections
      (user_id, access_token_encrypted, token_fingerprint, granted_scope, permitted_models,
       approved_budget, expires_at, key_valid, key_type, key_permissions, account_handle,
       account_avatar, balance, usage_summary, cache_expires_at, status, last_checked_at,
       last_error_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, NULL, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token_encrypted=excluded.access_token_encrypted, token_fingerprint=excluded.token_fingerprint,
      granted_scope=excluded.granted_scope, permitted_models=excluded.permitted_models,
      approved_budget=excluded.approved_budget, expires_at=excluded.expires_at,
      key_valid=excluded.key_valid, key_type=excluded.key_type, key_permissions=excluded.key_permissions,
      account_handle=excluded.account_handle, account_avatar=excluded.account_avatar,
      balance=excluded.balance, usage_summary=excluded.usage_summary,
      cache_expires_at=excluded.cache_expires_at, status='connected',
      last_checked_at=excluded.last_checked_at, last_error_code=NULL, updated_at=excluded.updated_at
  `).bind(
    userId, encrypted, fingerprint, scope.join(' '), JSON.stringify(POLLINATIONS_MODELS),
    key.budget ?? null, expiresAt, key.valid === false ? 0 : 1, key.type || null,
    JSON.stringify(key.permissions || []), profile.githubUsername || profile.name || null,
    profile.image || null, Number.isFinite(balanceValue) ? balanceValue : null,
    JSON.stringify(inspection.usage || null), now + 45, now, now, now,
  ).run();
}

export async function decryptPollinationsToken(connection) {
  return decryptIntegrationSecret(connection.access_token_encrypted, { keyEnv: ENCRYPTION_ENV });
}

export async function uploadPollinationsReference(token, file) {
  const form = new FormData();
  form.append('file', file, file.name || 'reference-image');
  const response = await fetch(`${MEDIA_PROVIDER}/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form, signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) throw providerError(response.status, 'reference_upload_failed');
  return { id: payload.id || payload.mediaId || null, url: payload.url };
}

export async function deletePollinationsReference(token, reference) {
  if (!reference?.id) return;
  await fetch(`${MEDIA_PROVIDER}/media/${encodeURIComponent(reference.id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(7000), cache: 'no-store',
  }).catch(() => {});
}

export async function refreshPollinationsConnection(db, row, { force = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  if (!row || (!force && (row.cache_expires_at || 0) > now)) return row;
  if (row.expires_at && row.expires_at <= now) {
    await db.prepare("UPDATE pollinations_connections SET status='expired', updated_at=? WHERE user_id=?").bind(now, row.user_id).run();
    return { ...row, status: 'expired' };
  }
  try {
    const token = await decryptPollinationsToken(row);
    const info = await inspectPollinationsToken(token);
    const balance = Number(info.balance?.balance ?? info.balance?.pollen ?? info.balance);
    await db.prepare(`UPDATE pollinations_connections SET key_valid=?, key_type=?, key_permissions=?,
      account_handle=?, account_avatar=?, balance=?, approved_budget=?, usage_summary=?, cache_expires_at=?,
      status='connected', last_checked_at=?, last_error_code=NULL, updated_at=? WHERE user_id=?`)
      .bind(info.key?.valid === false ? 0 : 1, info.key?.type || null, JSON.stringify(info.key?.permissions || []),
        info.profile?.githubUsername || info.profile?.name || null, info.profile?.image || null,
        Number.isFinite(balance) ? balance : null, info.key?.budget ?? row.approved_budget ?? null,
        JSON.stringify(info.usage || null), now + 45, now, now, row.user_id).run();
  } catch (error) {
    const status = error?.code === 'revoked' ? 'revoked' : 'error';
    await db.prepare('UPDATE pollinations_connections SET status=?, last_error_code=?, last_checked_at=?, cache_expires_at=?, updated_at=? WHERE user_id=?')
      .bind(status, error?.code || 'provider_unavailable', now, now + 30, now, row.user_id).run();
  }
  return db.prepare('SELECT * FROM pollinations_connections WHERE user_id=?').bind(row.user_id).first();
}

export function publicConnection(connection) {
  if (!connection) return { connected: false, status: 'disconnected' };
  const now = Math.floor(Date.now() / 1000);
  const expired = connection.expires_at && connection.expires_at <= now;
  const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const usage = parse(connection.usage_summary || 'null', null);
  const usageRows = Array.isArray(usage) ? usage : Array.isArray(usage?.data) ? usage.data : Array.isArray(usage?.usage) ? usage.usage : [];
  const toNumber = (value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const usageTotals = usageRows.reduce((totals, row) => ({
    requests: totals.requests + toNumber(row.requests ?? row.requestCount ?? row.count),
    pollen: totals.pollen + toNumber(row.cost ?? row.pollen ?? row.amount),
  }), { requests: 0, pollen: 0 });
  return {
    connected: !expired && connection.status === 'connected', status: expired ? 'expired' : connection.status,
    handle: connection.account_handle || null, avatar: connection.account_avatar || null,
    balance: connection.balance ?? null, budget: connection.approved_budget ?? null,
    scope: String(connection.granted_scope || '').split(' ').filter(Boolean),
    models: parse(connection.permitted_models || '[]', []).filter((model) => POLLINATIONS_MODELS.includes(model)),
    usage, usageTotals, expiresAt: connection.expires_at || null,
    lastRefreshedAt: connection.last_checked_at || null, errorCode: connection.last_error_code || null,
  };
}
