const TOKEN_PREFIX = 'lixmcp_'

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createMcpGrantToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const value = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `${TOKEN_PREFIX}${value}`
}

export async function hashMcpGrantToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized.startsWith(TOKEN_PREFIX) || normalized.length < 32) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return toHex(new Uint8Array(digest))
}

export function readBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export function normalizeMcpGrantScopes(scopes, legacyPermission) {
  if (scopes === undefined) {
    const permission = legacyPermission === 'read' ? 'read' : 'edit'
    return {
      permission,
      scopes: permission === 'edit' ? ['canvas:read', 'canvas:write'] : ['canvas:read'],
    }
  }
  if (!Array.isArray(scopes)) throw new Error('MCP scopes must be an array')
  const normalized = [...new Set(scopes.map((scope) => String(scope)))]
  const invalidScope = normalized.find((scope) => !['canvas:read', 'canvas:write'].includes(scope))
  if (invalidScope) throw new Error(`Unsupported MCP scope: ${invalidScope}`)
  if (!normalized.includes('canvas:read')) throw new Error('canvas:read is required')
  return {
    permission: normalized.includes('canvas:write') ? 'edit' : 'read',
    scopes: normalized.includes('canvas:write') ? ['canvas:read', 'canvas:write'] : ['canvas:read'],
  }
}

export async function authorizeMcpWorkspace(DB, request, sessionId, requiredPermission = 'read') {
  const tokenHash = await hashMcpGrantToken(readBearerToken(request))
  if (!tokenHash) return null
  const grant = await DB.prepare(
    `SELECT g.id, g.label, g.permission, g.expires_at, s.id AS scene_id,
            s.session_id, s.workspace_name, s.encrypted_data, s.agent_revision,
            s.updated_at, s.created_by
     FROM mcp_workspace_grants g
     JOIN scenes s ON s.id = g.scene_id
     WHERE g.token_hash = ? AND s.session_id = ? AND g.revoked_at IS NULL
       AND g.user_id = s.created_by
       AND g.expires_at > datetime('now')`
  ).bind(tokenHash, sessionId).first()
  if (!grant) return null
  if (requiredPermission === 'edit' && grant.permission !== 'edit') return { forbidden: true, grant }
  return { forbidden: false, grant }
}

export function sanitizeGrant(grant) {
  const { permission, scopes } = normalizeMcpGrantScopes(undefined, grant.permission)
  return {
    id: grant.id,
    sessionId: grant.session_id,
    label: grant.label,
    permission,
    scopes,
    createdAt: grant.created_at,
    expiresAt: grant.expires_at,
    lastUsedAt: grant.last_used_at || null,
    revokedAt: grant.revoked_at || null,
  }
}
