import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import { createMcpGrantToken, hashMcpGrantToken, normalizeMcpGrantScopes, sanitizeGrant } from '@/lib/mcpGrants'
import { REMOTE_MCP_ENABLED } from '@/lib/featureFlags'

export const runtime = 'edge'

function unavailable() {
  return NextResponse.json({ error: 'MCP workspace access is unavailable in local development until D1 is configured.' }, { status: 503 })
}

function comingSoon() {
  return NextResponse.json({ error: 'Remote MCP workspace access is coming soon.' }, { status: 503 })
}

async function bindings() {
  try { return getCloudflareBindings() } catch { return null }
}

export async function GET(request) {
  if (!REMOTE_MCP_ENABLED) return comingSoon()
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const cloudflare = await bindings()
  if (!cloudflare?.DB) return unavailable()
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  const grants = await cloudflare.DB.prepare(
    `SELECT g.*, s.session_id FROM mcp_workspace_grants g
     JOIN scenes s ON s.id = g.scene_id
     WHERE g.user_id = ? AND s.session_id = ?
       AND g.revoked_at IS NULL AND g.expires_at > datetime('now')
     ORDER BY g.created_at DESC`
  ).bind(user.id, sessionId).all()
  return NextResponse.json({ grants: (grants.results || []).map(sanitizeGrant) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  if (!REMOTE_MCP_ENABLED) return comingSoon()
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const cloudflare = await bindings()
  if (!cloudflare?.DB) return unavailable()
  const body = await request.json().catch(() => ({}))
  const sessionId = String(body.sessionId || '')
  let permission
  try {
    permission = normalizeMcpGrantScopes(body.scopes, body.permission).permission
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  const label = String(body.label || 'MCP client').trim().slice(0, 48) || 'MCP client'
  const expiresInDays = Math.max(1, Math.min(90, Number(body.expiresInDays) || 30))
  const scene = await cloudflare.DB.prepare(
    `SELECT id FROM scenes WHERE session_id = ? AND created_by = ? AND owner_type = 'user'`
  ).bind(sessionId, user.id).first()
  if (!scene) return NextResponse.json({ error: 'Workspace not found or not owned by this account' }, { status: 404 })
  const active = await cloudflare.DB.prepare(
    `SELECT COUNT(*) AS count FROM mcp_workspace_grants
     WHERE scene_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
  ).bind(scene.id).first()
  if (Number(active?.count || 0) >= 10) return NextResponse.json({ error: 'This workspace already has 10 active MCP clients. Revoke one before creating another.' }, { status: 429 })
  const token = createMcpGrantToken()
  const tokenHash = await hashMcpGrantToken(token)
  const id = crypto.randomUUID()
  await cloudflare.DB.prepare(
    `INSERT INTO mcp_workspace_grants (id, scene_id, user_id, token_hash, label, permission, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`
  ).bind(id, scene.id, user.id, tokenHash, label, permission, `+${expiresInDays} days`).run()
  const grant = await cloudflare.DB.prepare(
    `SELECT g.*, ? AS session_id FROM mcp_workspace_grants g WHERE g.id = ?`
  ).bind(sessionId, id).first()
  return NextResponse.json({ grant: sanitizeGrant(grant), token }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request) {
  if (!REMOTE_MCP_ENABLED) return comingSoon()
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const cloudflare = await bindings()
  if (!cloudflare?.DB) return unavailable()
  const body = await request.json().catch(() => ({}))
  if (!body.grantId) return NextResponse.json({ error: 'Missing grantId' }, { status: 400 })
  const result = await cloudflare.DB.prepare(
    `UPDATE mcp_workspace_grants SET revoked_at = datetime('now')
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(body.grantId, user.id).run()
  if (!result.meta?.changes) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })
  return NextResponse.json({ revoked: true })
}
