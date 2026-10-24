import { ApiAuthError } from './bearerAuth.js';

const TOKEN_PREFIX = 'lix_pat_';
const MAX_EXPIRY_DAYS = 365;
export const MAX_ACTIVE_PERSONAL_ACCESS_TOKENS = 10;

export const PERSONAL_ACCESS_TOKEN_SCOPES = Object.freeze([
  'lixblogs:profile:read',
  'lixblogs:profile:write',
  'lixblogs:blog:read',
  'lixblogs:blog:write',
  'lixblogs:blog:publish',
  'lixblogs:blog:delete',
  'lixblogs:media:read',
  'lixblogs:media:write',
  'lixblogs:organizations:read',
  'lixblogs:organizations:write',
  'lixblogs:collaboration:read',
  'lixblogs:collaboration:write',
  'lixblogs:analytics:read',
  'lixblogs:notifications:read',
]);

const SCOPE_SET = new Set(PERSONAL_ACCESS_TOKEN_SCOPES);

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) throw new Error('scopes_required');
  const normalized = [...new Set(scopes.map((scope) => String(scope || '').trim()).filter(Boolean))];
  if (!normalized.length || normalized.some((scope) => !SCOPE_SET.has(scope))) {
    throw new Error('invalid_scopes');
  }
  return normalized;
}

export function serializePersonalAccessToken(row) {
  let scopes = [];
  try { scopes = JSON.parse(row.scopes || '[]'); } catch {}
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    scopes,
    resourceType: row.resource_type,
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    expiresAt: row.expires_at || null,
    lastUsedAt: row.last_used_at || null,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at,
  };
}

export async function createPersonalAccessToken(db, userId, input = {}) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 80) throw new Error('invalid_name');
  const scopes = normalizeScopes(input.scopes);
  const resourceType = input.resourceType === 'organization' ? 'organization' : 'personal';
  const organizationId = resourceType === 'organization' ? String(input.organizationId || '').trim() : null;
  if (resourceType === 'organization') {
    if (!organizationId) throw new Error('organization_required');
    const membership = await db.prepare(`
      SELECT o.id FROM orgs o
      LEFT JOIN org_members m ON m.org_id = o.id AND m.user_id = ?
      WHERE o.id = ? AND (o.owner_id = ? OR m.user_id IS NOT NULL)
    `).bind(userId, organizationId, userId).first();
    if (!membership) throw new Error('organization_forbidden');
  }

  const expiryDays = input.expiryDays == null ? 90 : Number(input.expiryDays);
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > MAX_EXPIRY_DAYS) {
    throw new Error('invalid_expiry');
  }

  const now = Math.floor(Date.now() / 1000);
  const active = await db.prepare(`
    SELECT COUNT(*) AS count FROM api_personal_access_tokens
    WHERE user_id = ? AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).bind(userId, now).first();
  if (Number(active?.count || 0) >= MAX_ACTIVE_PERSONAL_ACCESS_TOKENS) {
    throw new Error('token_limit');
  }

  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `${TOKEN_PREFIX}${bytesToBase64Url(secretBytes)}`;
  const id = crypto.randomUUID();
  const expiresAt = now + expiryDays * 86400;
  const tokenPrefix = token.slice(0, 19);
  await db.prepare(`
    INSERT INTO api_personal_access_tokens
      (id, user_id, name, token_prefix, token_hash, scopes, resource_type,
       organization_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, name, tokenPrefix, await sha256(token), JSON.stringify(scopes),
    resourceType, organizationId, expiresAt, now,
  ).run();

  return {
    token,
    record: serializePersonalAccessToken({
      id,
      name,
      token_prefix: tokenPrefix,
      scopes: JSON.stringify(scopes),
      resource_type: resourceType,
      organization_id: organizationId,
      expires_at: expiresAt,
      last_used_at: null,
      revoked_at: null,
      created_at: now,
    }),
  };
}

export async function verifyPersonalAccessToken(db, token) {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 40 || token.length > 128) {
    throw new ApiAuthError('invalid_token', 'The personal access token is malformed.');
  }
  const row = await db.prepare(`
    SELECT id, user_id, scopes, resource_type, organization_id, expires_at,
      last_used_at, revoked_at
    FROM api_personal_access_tokens WHERE token_hash = ? LIMIT 1
  `).bind(await sha256(token)).first();
  const now = Math.floor(Date.now() / 1000);
  if (!row || row.revoked_at) throw new ApiAuthError('invalid_token', 'The personal access token is invalid or revoked.');
  if (row.expires_at && row.expires_at <= now) {
    throw new ApiAuthError('token_expired', 'The personal access token has expired.');
  }

  if (row.resource_type === 'organization') {
    const membership = await db.prepare(`
      SELECT o.id FROM orgs o
      LEFT JOIN org_members m ON m.org_id = o.id AND m.user_id = ?
      WHERE o.id = ? AND (o.owner_id = ? OR m.user_id IS NOT NULL)
    `).bind(row.user_id, row.organization_id, row.user_id).first();
    if (!membership) throw new ApiAuthError('organization_access_revoked', 'Organization access for this token is no longer available.', 403);
  }

  if (!row.last_used_at || row.last_used_at < now - 300) {
    await db.prepare('UPDATE api_personal_access_tokens SET last_used_at = ? WHERE id = ?')
      .bind(now, row.id).run();
  }
  let scopes = [];
  try { scopes = JSON.parse(row.scopes || '[]'); } catch {}
  return {
    userId: row.user_id,
    clientId: `pat:${row.id}`,
    credentialId: row.id,
    credentialType: 'pat',
    resourceType: row.resource_type,
    organizationId: row.organization_id || null,
    scopes: scopes.filter((scope) => SCOPE_SET.has(scope)),
    expiresAt: row.expires_at || null,
  };
}

export function credentialAllowsPublishedAs(auth, publishedAs, authorId = null) {
  if (auth?.credentialType !== 'pat') return true;
  if (auth.resourceType === 'organization') return publishedAs === `org:${auth.organizationId}`;
  return !String(publishedAs || 'personal').startsWith('org:') && (!authorId || authorId === auth.userId);
}

export async function enforcePersonalAccessTokenRoute(db, auth, request) {
  if (auth?.credentialType !== 'pat') return;
  const url = new URL(request.url);
  const path = url.pathname;

  if (auth.resourceType === 'organization') {
    if (path.startsWith('/api/v1/collections') || path.startsWith('/api/v1/contests')) {
      throw new ApiAuthError('credential_scope_forbidden', 'Curated collections and contests currently require a personal token.', 403);
    }
    if (path === '/api/v1/me' || path.startsWith('/api/v1/integrations/') || path.startsWith('/api/v1/collaboration/invitations')) {
      throw new ApiAuthError('credential_scope_forbidden', 'This organization token cannot access personal account resources.', 403);
    }
    if (path === '/api/v1/analytics' && url.searchParams.get('scope') !== `org:${auth.organizationId}`) {
      throw new ApiAuthError('credential_scope_forbidden', 'This token is restricted to its organization analytics.', 403);
    }
    const orgMatch = path.match(/^\/api\/v1\/orgs\/([^/]+)/);
    if (orgMatch) {
      const requested = decodeURIComponent(orgMatch[1]);
      const org = await db.prepare('SELECT id FROM orgs WHERE id = ? OR slug = ? LIMIT 1').bind(requested, requested).first();
      if (!org || org.id !== auth.organizationId) {
        throw new ApiAuthError('credential_scope_forbidden', 'This token is restricted to another organization.', 403);
      }
    }
  } else {
    if (path.startsWith('/api/v1/orgs')) {
      throw new ApiAuthError('credential_scope_forbidden', 'This personal token cannot access organization resources.', 403);
    }
    if (path === '/api/v1/analytics' && String(url.searchParams.get('scope') || 'personal').startsWith('org:')) {
      throw new ApiAuthError('credential_scope_forbidden', 'This personal token cannot access organization analytics.', 403);
    }
  }

  const blogMatch = path.match(/^\/api\/v1\/blogs\/([^/]+)/);
  if (blogMatch) {
    const blogId = decodeURIComponent(blogMatch[1]);
    const blog = await db.prepare('SELECT author_id, published_as FROM blogs WHERE id = ? LIMIT 1').bind(blogId).first();
    if (blog && !credentialAllowsPublishedAs(auth, blog.published_as)) {
      throw new ApiAuthError('credential_scope_forbidden', 'This token cannot access that blog.', 403);
    }
  }

  const mediaMatch = path.match(/^\/api\/v1\/media\/([^/]+)/);
  if (mediaMatch && mediaMatch[1] !== 'upload' && mediaMatch[1] !== 'generate') {
    const mediaId = decodeURIComponent(mediaMatch[1]);
    const media = await db.prepare(`
      SELECT b.published_as FROM media_uploads m
      LEFT JOIN blogs b ON b.id = m.blog_id
      WHERE m.id = ? AND m.user_id = ? LIMIT 1
    `).bind(mediaId, auth.userId).first();
    if (media && !credentialAllowsPublishedAs(auth, media.published_as || 'personal')) {
      throw new ApiAuthError('credential_scope_forbidden', 'This token cannot access that media asset.', 403);
    }
  }
}
