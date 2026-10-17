import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/integrationSecrets'
import { POLLINATIONS_MODELS, pollinationsTokenExpiry } from '@/lib/pollinationsOAuth'

async function loadConnection(db, userId) {
  return db.prepare(`
    SELECT user_id, enabled, access_token_encrypted, token_expires_at, oauth_scope,
           provider_user_id, provider_username, allowed_models, created_at, updated_at
    FROM pollinations_connections WHERE user_id = ?
  `).bind(userId).first()
}

export async function savePollinationsConnection(db, userId, config) {
  const now = Math.floor(Date.now() / 1000)
  const encrypted = await encryptIntegrationSecret(config.accessToken, userId, 'pollinations')
  await db.prepare(`
    INSERT INTO pollinations_connections
      (user_id, enabled, access_token_encrypted, token_expires_at, oauth_scope,
       provider_user_id, provider_username, allowed_models, created_at, updated_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled = 1,
      access_token_encrypted = excluded.access_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      oauth_scope = excluded.oauth_scope,
      provider_user_id = excluded.provider_user_id,
      provider_username = excluded.provider_username,
      allowed_models = excluded.allowed_models,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    encrypted,
    pollinationsTokenExpiry(config.expiresIn, now),
    config.scope || '',
    config.providerUserId || null,
    config.providerUsername || null,
    POLLINATIONS_MODELS.join(','),
    now,
    now,
  ).run()
}

export async function getPollinationsConnection(db, userId, { includeDisabled = false, includeExpired = false } = {}) {
  const row = await loadConnection(db, userId)
  if (!row || (!includeDisabled && !row.enabled)) return null
  const expired = Number(row.token_expires_at || 0) <= Math.floor(Date.now() / 1000)
  if (expired && !includeExpired) return null
  const allowedModels = String(row.allowed_models || '').split(',').filter((model) => POLLINATIONS_MODELS.includes(model))
  return {
    userId,
    enabled: Boolean(row.enabled),
    expired,
    expiresAt: Number(row.token_expires_at || 0),
    scope: row.oauth_scope || '',
    providerUserId: row.provider_user_id || null,
    providerUsername: row.provider_username || null,
    allowedModels: allowedModels.length ? allowedModels : [...POLLINATIONS_MODELS],
    accessToken: await decryptIntegrationSecret(row.access_token_encrypted, userId, 'pollinations'),
    connectedAt: Number(row.created_at || 0),
  }
}

export async function getPollinationsConnectionStatus(db, userId) {
  const row = await loadConnection(db, userId)
  if (!row) return { connected: false, usePersonalPollen: false, expired: false, allowedModels: [...POLLINATIONS_MODELS] }
  const expired = Number(row.token_expires_at || 0) <= Math.floor(Date.now() / 1000)
  return {
    connected: true,
    usePersonalPollen: Boolean(row.enabled) && !expired,
    expired,
    expiresAt: Number(row.token_expires_at || 0),
    scope: row.oauth_scope || '',
    providerUsername: row.provider_username || null,
    allowedModels: String(row.allowed_models || '').split(',').filter((model) => POLLINATIONS_MODELS.includes(model)),
    connectedAt: Number(row.created_at || 0),
  }
}
