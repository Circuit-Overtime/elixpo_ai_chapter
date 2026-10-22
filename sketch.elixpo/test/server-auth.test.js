import assert from 'node:assert/strict'
import test from 'node:test'

import { getAuthenticatedUser } from '../src/lib/serverAuth.js'
import { normalizeMcpGrantScopes, sanitizeGrant } from '../src/lib/mcpGrants.js'

function requestWith({ bearer, cookie } = {}) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'authorization' && bearer ? `Bearer ${bearer}` : null
      },
    },
    cookies: {
      get(name) {
        if (name !== 'lixsketch-session' || !cookie) return undefined
        return { value: encodeURIComponent(JSON.stringify(cookie)) }
      },
    },
  }
}

test('server auth accepts the current bearer token and falls back to its cookie', async () => {
  const originalFetch = globalThis.fetch
  const tokens = []
  globalThis.fetch = async (_url, options) => {
    tokens.push(options.headers.Authorization)
    return {
      ok: true,
      async json() {
        return { id: 'user-1', email: 'owner@example.com', displayName: 'Owner' }
      },
    }
  }

  try {
    const bearerUser = await getAuthenticatedUser(requestWith({
      bearer: 'current-token',
      cookie: { sessionToken: 'stale-token', user: { email: 'stale@example.com' } },
    }))
    const cookieUser = await getAuthenticatedUser(requestWith({
      cookie: { sessionToken: 'cookie-token', user: { email: 'owner@example.com' } },
    }))

    assert.equal(bearerUser.id, 'user-1')
    assert.equal(cookieUser.id, 'user-1')
    assert.deepEqual(tokens, ['Bearer current-token', 'Bearer cookie-token'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCP grants expose the effective canvas scopes', () => {
  assert.deepEqual(sanitizeGrant({ id: 'read', permission: 'read' }).scopes, ['canvas:read'])
  assert.deepEqual(sanitizeGrant({ id: 'edit', permission: 'edit' }).scopes, ['canvas:read', 'canvas:write'])
  assert.equal(normalizeMcpGrantScopes(['canvas:read'], 'edit').permission, 'read')
  assert.equal(normalizeMcpGrantScopes(['canvas:read', 'canvas:write'], 'read').permission, 'edit')
  assert.throws(() => normalizeMcpGrantScopes([], 'edit'), /canvas:read is required/)
  assert.throws(() => normalizeMcpGrantScopes(['canvas:read', 'admin'], 'read'), /Unsupported MCP scope/)
})
