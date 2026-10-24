import { decryptIntegrationSecret, encryptIntegrationSecret } from './integrationSecrets.js';
import { isValidCloudinaryCloudName, refreshCloudinaryTokens, tokenExpiry } from './cloudinaryOAuth.js';

export const PLATFORM_CLOUDINARY = 'platform_cloudinary';
export const USER_CLOUDINARY = 'user_cloudinary';

export function parseCloudinaryUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a valid cloudinary:// API environment URL');
  }
  if (parsed.protocol !== 'cloudinary:' || !parsed.username || !parsed.password || !parsed.hostname) {
    throw new Error('The Cloudinary URL must include an API key, API secret, and cloud name');
  }
  if (!isValidCloudinaryCloudName(parsed.hostname)) throw new Error('Invalid Cloudinary cloud name');
  return {
    cloudName: parsed.hostname,
    apiKey: decodeURIComponent(parsed.username),
    apiSecret: decodeURIComponent(parsed.password),
  };
}

export async function saveCloudinaryConnection(db, userId, config) {
  const now = Math.floor(Date.now() / 1000);
  const encryptedSecret = await encryptIntegrationSecret(config.apiSecret);
  await db.prepare(`
    INSERT INTO cloudinary_connections
      (user_id, cloud_name, api_key, api_secret_encrypted, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      cloud_name = excluded.cloud_name,
      api_key = excluded.api_key,
      api_secret_encrypted = excluded.api_secret_encrypted,
      enabled = 1,
      updated_at = excluded.updated_at,
      auth_method = 'api_secret',
      access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      access_token_expires_at = NULL,
      oauth_scope = NULL,
      refresh_lock_until = NULL
  `).bind(userId, config.cloudName, config.apiKey, encryptedSecret, now, now).run();
}

export async function saveCloudinaryOAuthConnection(db, userId, config) {
  const now = Math.floor(Date.now() / 1000);
  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    encryptIntegrationSecret(config.accessToken),
    encryptIntegrationSecret(config.refreshToken),
  ]);
  await db.prepare(`
    INSERT INTO cloudinary_connections
      (user_id, cloud_name, api_key, api_secret_encrypted, enabled, created_at, updated_at,
       auth_method, access_token_encrypted, refresh_token_encrypted,
       access_token_expires_at, oauth_scope, refresh_lock_until)
    VALUES (?, ?, '', '', 1, ?, ?, 'oauth', ?, ?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      cloud_name = excluded.cloud_name,
      api_key = '',
      api_secret_encrypted = '',
      enabled = 1,
      updated_at = excluded.updated_at,
      auth_method = 'oauth',
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_expires_at = excluded.access_token_expires_at,
      oauth_scope = excluded.oauth_scope,
      refresh_lock_until = NULL
  `).bind(
    userId,
    config.cloudName,
    now,
    now,
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenExpiry(config.expiresIn, now),
    config.scope || '',
  ).run();
}

async function loadConnectionRow(db, userId) {
  return db.prepare(`
    SELECT user_id, cloud_name, api_key, api_secret_encrypted, enabled, created_at, updated_at,
           auth_method, access_token_encrypted, refresh_token_encrypted,
           access_token_expires_at, oauth_scope, refresh_lock_until
    FROM cloudinary_connections WHERE user_id = ?
  `).bind(userId).first();
}

async function waitForRefreshedConnection(db, userId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const row = await loadConnectionRow(db, userId);
    if (row?.access_token_encrypted
      && Number(row.access_token_expires_at || 0) > Math.floor(Date.now() / 1000) + 30) return row;
  }
  throw new Error('Cloudinary token refresh is still in progress');
}

async function refreshOAuthConnection(db, row) {
  const now = Math.floor(Date.now() / 1000);
  const claimed = await db.prepare(`
    UPDATE cloudinary_connections SET refresh_lock_until = ?
    WHERE user_id = ? AND auth_method = 'oauth'
      AND (refresh_lock_until IS NULL OR refresh_lock_until < ?)
  `).bind(now + 30, row.user_id, now).run();

  if (!claimed.meta?.changes) return waitForRefreshedConnection(db, row.user_id);

  try {
    const refreshToken = await decryptIntegrationSecret(row.refresh_token_encrypted);
    const tokens = await refreshCloudinaryTokens(refreshToken);
    if (!tokens.refresh_token) throw new Error('Cloudinary did not rotate the refresh token');
    const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
      encryptIntegrationSecret(tokens.access_token),
      encryptIntegrationSecret(tokens.refresh_token),
    ]);
    const expiresAt = tokenExpiry(tokens.expires_in, now);
    await db.prepare(`
      UPDATE cloudinary_connections
      SET access_token_encrypted = ?, refresh_token_encrypted = ?,
          access_token_expires_at = ?, oauth_scope = ?, refresh_lock_until = NULL,
          updated_at = ?
      WHERE user_id = ?
    `).bind(
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
      tokens.scope || row.oauth_scope || '',
      now,
      row.user_id,
    ).run();
    return {
      ...row,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      access_token_expires_at: expiresAt,
      oauth_scope: tokens.scope || row.oauth_scope || '',
      refresh_lock_until: null,
      updated_at: now,
    };
  } catch (error) {
    await db.prepare(
      'UPDATE cloudinary_connections SET refresh_lock_until = NULL WHERE user_id = ?',
    ).bind(row.user_id).run().catch(() => {});
    throw error;
  }
}

export async function getUserCloudinaryConnection(db, userId, { includeDisabled = false } = {}) {
  let row = await loadConnectionRow(db, userId);
  if (!row || (!includeDisabled && !row.enabled)) return null;
  if (row.auth_method === 'oauth') {
    if (!row.access_token_encrypted || !row.refresh_token_encrypted) {
      throw new Error('Cloudinary OAuth tokens are incomplete');
    }
    if (Number(row.access_token_expires_at || 0) <= Math.floor(Date.now() / 1000) + 30) {
      row = await refreshOAuthConnection(db, row);
    }
    return {
      userId: row.user_id,
      cloudName: row.cloud_name,
      oauthToken: await decryptIntegrationSecret(row.access_token_encrypted),
      authMethod: 'oauth',
      enabled: !!row.enabled,
      scope: row.oauth_scope || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return {
    userId: row.user_id,
    cloudName: row.cloud_name,
    apiKey: row.api_key,
    apiSecret: await decryptIntegrationSecret(row.api_secret_encrypted),
    authMethod: 'api_secret',
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getStorageTarget(db, userId) {
  const connection = await getUserCloudinaryConnection(db, userId);
  if (!connection) return { provider: PLATFORM_CLOUDINARY, cloudName: null, config: null };
  return { provider: USER_CLOUDINARY, cloudName: connection.cloudName, config: connection };
}

export async function getMediaCloudinaryConfig(db, media) {
  if (media.storage_provider !== USER_CLOUDINARY) return null;
  const connection = await getUserCloudinaryConnection(db, media.user_id, { includeDisabled: true });
  if (!connection || connection.cloudName !== media.storage_cloud_name) {
    throw new Error('The creator Cloudinary connection is unavailable');
  }
  return connection;
}
