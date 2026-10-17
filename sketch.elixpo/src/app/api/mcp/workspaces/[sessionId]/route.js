import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { authorizeMcpWorkspace } from '@/lib/mcpGrants'
import { REMOTE_MCP_ENABLED } from '@/lib/featureFlags'

export const runtime = 'edge'

const MAX_ENCRYPTED_SCENE_BYTES = 20 * 1024 * 1024

function authError(result) {
  if (result?.forbidden) return NextResponse.json({ error: 'This grant is read-only' }, { status: 403 })
  return NextResponse.json({ error: 'Invalid, expired, or revoked workspace grant' }, { status: 401 })
}

function comingSoon() {
  return NextResponse.json({ error: 'Remote MCP workspace access is coming soon.' }, { status: 503 })
}

export async function GET(request, { params }) {
  if (!REMOTE_MCP_ENABLED) return comingSoon()
  try {
    const { sessionId } = await params
    const { DB } = getCloudflareBindings()
    const access = await authorizeMcpWorkspace(DB, request, sessionId)
    if (!access || access.forbidden) return authError(access)
    await DB.prepare(`UPDATE mcp_workspace_grants SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-5 minutes'))`).bind(access.grant.id).run()
    return NextResponse.json({
      sessionId,
      workspaceName: access.grant.workspace_name,
      encryptedData: access.grant.encrypted_data,
      revision: Number(access.grant.agent_revision || 0),
      updatedAt: access.grant.updated_at,
      permission: access.grant.permission,
    }, { headers: { 'Cache-Control': 'no-store', ETag: `"${Number(access.grant.agent_revision || 0)}"` } })
  } catch (error) {
    console.error('[api/mcp/workspaces] Read failed:', error)
    return NextResponse.json({ error: 'Could not read the remote workspace' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  if (!REMOTE_MCP_ENABLED) return comingSoon()
  try {
    const { sessionId } = await params
    const cloudflare = getCloudflareBindings()
    const access = await authorizeMcpWorkspace(cloudflare.DB, request, sessionId, 'edit')
    if (!access || access.forbidden) return authError(access)
    const body = await request.json().catch(() => ({}))
    if (typeof body.encryptedData !== 'string' || !body.encryptedData) {
      return NextResponse.json({ error: 'Missing encryptedData' }, { status: 400 })
    }
    const sizeBytes = new Blob([body.encryptedData]).size
    if (sizeBytes > MAX_ENCRYPTED_SCENE_BYTES) return NextResponse.json({ error: 'Encrypted scene exceeds 20 MB' }, { status: 413 })
    const expectedRevision = Number(body.expectedRevision)
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 })
    }
    const workspaceName = String(body.workspaceName || access.grant.workspace_name || 'Untitled').slice(0, 20)
    const result = await cloudflare.DB.prepare(
      `UPDATE scenes SET encrypted_data = ?, workspace_name = ?, updated_at = datetime('now'),
       last_accessed_at = datetime('now'), size_bytes = ?, agent_revision = agent_revision + 1
       WHERE id = ? AND agent_revision = ?`
    ).bind(body.encryptedData, workspaceName, sizeBytes, access.grant.scene_id, expectedRevision).run()
    if (!result.meta?.changes) {
      const current = await cloudflare.DB.prepare(`SELECT agent_revision FROM scenes WHERE id = ?`).bind(access.grant.scene_id).first()
      return NextResponse.json({ error: 'REVISION_CONFLICT', expectedRevision, currentRevision: Number(current?.agent_revision || 0) }, { status: 409 })
    }
    const revision = expectedRevision + 1
    await cloudflare.DB.prepare(`UPDATE mcp_workspace_grants SET last_used_at = datetime('now') WHERE id = ?`).bind(access.grant.id).run()
    await relayAgentUpdate(cloudflare, sessionId, {
      payload: body.encryptedData,
      revision,
      agent: { id: access.grant.id, label: access.grant.label },
    })
    return NextResponse.json({ saved: true, revision, updatedAt: new Date().toISOString() }, { headers: { ETag: `"${revision}"` } })
  } catch (error) {
    console.error('[api/mcp/workspaces] Write failed:', error)
    return NextResponse.json({ error: 'Could not update the remote workspace' }, { status: 500 })
  }
}

async function relayAgentUpdate(cloudflare, sessionId, message) {
  if (!cloudflare.MCP_RELAY_URL || !cloudflare.MCP_RELAY_SECRET) return
  if (message.payload.length > 900_000) return
  try {
    const response = await fetch(`${String(cloudflare.MCP_RELAY_URL).replace(/\/$/, '')}/internal/rooms/${encodeURIComponent(sessionId)}/agent-op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudflare.MCP_RELAY_SECRET}` },
      body: JSON.stringify(message),
    })
    if (!response.ok) console.warn('[api/mcp/workspaces] Realtime relay rejected:', response.status)
  } catch (error) {
    console.warn('[api/mcp/workspaces] Realtime relay unavailable:', error)
  }
}
