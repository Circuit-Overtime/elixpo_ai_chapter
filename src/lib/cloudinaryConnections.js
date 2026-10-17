import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/integrationSecrets'
import { refreshCloudinaryTokens, tokenExpiry } from '@/lib/cloudinaryOAuth'

async function loadConnection(db, userId) {
  return db.prepare(`
    SELECT user_id, cloud_name, enabled, access_token_encrypted,
           refresh_token_encrypted, access_token_expires_at, oauth_scope,
           refresh_lock_until, created_at, updated_at
    FROM cloudinary_connections WHERE user_id = ?
  `).bind(userId).first()
}

export async function saveCloudinaryConnection(db, userId, config) {
  const now = Math.floor(Date.now() / 1000)
  const [accessToken, refreshToken] = await Promise.all([
    encryptIntegrationSecret(config.accessToken, userId),
    encryptIntegrationSecret(config.refreshToken, userId),
  ])
  await db.prepare(`
    INSERT INTO cloudinary_connections
      (user_id, cloud_name, enabled, access_token_encrypted,
       refresh_token_encrypted, access_token_expires_at, oauth_scope,
       refresh_lock_until, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      cloud_name = excluded.cloud_name,
      enabled = 1,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_expires_at = excluded.access_token_expires_at,
      oauth_scope = excluded.oauth_scope,
      refresh_lock_until = NULL,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    config.cloudName,
    accessToken,
    refreshToken,
    tokenExpiry(config.expiresIn, now),
    config.scope || '',
    now,
    now,
  ).run()
}

async function waitForRefresh(db, userId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const row = await loadConnection(db, userId)
    if (Number(row?.access_token_expires_at || 0) > Math.floor(Date.now() / 1000) + 30) return row
  }
  throw new Error('Cloudinary token refresh is still in progress')
}

async function refreshConnection(db, row) {
  const now = Math.floor(Date.now() / 1000)
  const claimed = await db.prepare(`
    UPDATE cloudinary_connections SET refresh_lock_until = ?
    WHERE user_id = ? AND (refresh_lock_until IS NULL OR refresh_lock_until < ?)
  `).bind(now + 30, row.user_id, now).run()
  if (!claimed.meta?.changes) return waitForRefresh(db, row.user_id)

  try {
    const refreshToken = await decryptIntegrationSecret(row.refresh_token_encrypted, row.user_id)
    const tokens = await refreshCloudinaryTokens(refreshToken)
    const nextRefreshToken = tokens.refresh_token || refreshToken
    const [accessEncrypted, refreshEncrypted] = await Promise.all([
      encryptIntegrationSecret(tokens.access_token, row.user_id),
      encryptIntegrationSecret(nextRefreshToken, row.user_id),
    ])
    const expiresAt = tokenExpiry(tokens.expires_in, now)
    await db.prepare(`
      UPDATE cloudinary_connections
      SET access_token_encrypted = ?, refresh_token_encrypted = ?,
          access_token_expires_at = ?, oauth_scope = ?, refresh_lock_until = NULL,
          updated_at = ? WHERE user_id = ?
    `).bind(
      accessEncrypted,
      refreshEncrypted,
      expiresAt,
      tokens.scope || row.oauth_scope || '',
      now,
      row.user_id,
    ).run()
    return {
      ...row,
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      access_token_expires_at: expiresAt,
      oauth_scope: tokens.scope || row.oauth_scope || '',
    }
  } catch (error) {
    await db.prepare(`UPDATE cloudinary_connections SET refresh_lock_until = NULL WHERE user_id = ?`)
      .bind(row.user_id).run().catch(() => {})
    throw error
  }
}

export async function getCloudinaryConnection(db, userId, { includeDisabled = false } = {}) {
  let row = await loadConnection(db, userId)
  if (!row || (!includeDisabled && !row.enabled)) return null
  if (Number(row.access_token_expires_at || 0) <= Math.floor(Date.now() / 1000) + 30) {
    row = await refreshConnection(db, row)
  }
  return {
    userId,
    cloudName: row.cloud_name,
    oauthToken: await decryptIntegrationSecret(row.access_token_encrypted, userId),
    enabled: Boolean(row.enabled),
    scope: row.oauth_scope || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getCloudinaryConnectionStatus(db, userId) {
  const connection = await loadConnection(db, userId)
  if (!connection) {
    return {
      connected: false,
      useForUploads: false,
      cloudName: null,
      scope: '',
      mediaCount: 0,
      trackedBytes: 0,
      connectedAt: null,
    }
  }
  const usage = await db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
    FROM image_assets WHERE uploaded_by = ? AND storage_provider = 'user_cloudinary'
  `).bind(userId).first()
  return {
    connected: true,
    useForUploads: Boolean(connection.enabled),
    cloudName: connection.cloud_name,
    scope: connection.oauth_scope || '',
    mediaCount: Number(usage?.count || 0),
    trackedBytes: Number(usage?.bytes || 0),
    connectedAt: connection.created_at || null,
  }
}
