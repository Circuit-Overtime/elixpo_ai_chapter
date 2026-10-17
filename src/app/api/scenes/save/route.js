import { NextResponse } from 'next/server'
import { getCloudflareBindings, generateToken } from '@/lib/cloudflare'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'

export const runtime = 'edge'

const MAX_WORKSPACE_NAME_LENGTH = 20

export async function POST(request) {
  try {
    let DB;
    try {
      const bindings = getCloudflareBindings()
      DB = bindings.DB
    } catch {
      // Mock successful save response to keep AutoSave UI happy and silence console errors
      return NextResponse.json({ sceneId: 'local-dev-mock-scene', token: 'local-dev-mock-token' }, { status: 200 })
    }

    if (!DB) {
      return NextResponse.json({ sceneId: 'local-dev-mock-scene', token: 'local-dev-mock-token' }, { status: 200 })
    }
    
    const body = await request.json()

    if (!body.sessionId || !body.encryptedData) {
      return NextResponse.json({ error: 'Missing sessionId or encryptedData' }, { status: 400 })
    }

    const workspaceName = String(body.workspaceName || 'Untitled').slice(0, MAX_WORKSPACE_NAME_LENGTH)

    const ownerType = body.createdBy && !body.createdBy.startsWith('guest-') ? 'user' : 'guest'
    let tier = 'guest'
    if (ownerType === 'user') {
      const user = await DB.prepare(`SELECT tier FROM users WHERE id = ?`).bind(body.createdBy).first()
      tier = normalizePlanTier(user?.tier, true)
    }
    const maxWorkspaces = getPlanLimits(tier).workspaces

    // Check if this is an update to an existing workspace (same session_id)
    const existing = await DB.prepare(
      `SELECT id FROM scenes WHERE session_id = ?`
    ).bind(body.sessionId).first()

    if (existing) {
      // Update existing workspace — no limit check needed
      const sizeBytes = new Blob([body.encryptedData]).size
      const expectedRevision = Number(body.expectedRevision)
      const conditional = Number.isInteger(expectedRevision) && expectedRevision >= 0
      const update = await DB.prepare(
        `UPDATE scenes SET encrypted_data = ?, workspace_name = ?, updated_at = datetime('now'),
         last_accessed_at = datetime('now'), size_bytes = ?, owner_type = ?,
         agent_revision = agent_revision + 1
         WHERE id = ?${conditional ? ' AND agent_revision = ?' : ''}`
      ).bind(
        body.encryptedData,
        workspaceName,
        sizeBytes,
        ownerType,
        existing.id,
        ...(conditional ? [expectedRevision] : [])
      ).run()
      if (conditional && !update.meta?.changes) {
        const current = await DB.prepare(`SELECT agent_revision FROM scenes WHERE id = ?`).bind(existing.id).first()
        return NextResponse.json({ error: 'REVISION_CONFLICT', expectedRevision, currentRevision: Number(current?.agent_revision || 0) }, { status: 409 })
      }

      // Get existing token
      const perm = await DB.prepare(
        `SELECT token FROM scene_permissions WHERE scene_id = ?`
      ).bind(existing.id).first()

      const revision = await DB.prepare(`SELECT agent_revision FROM scenes WHERE id = ?`).bind(existing.id).first()
      return NextResponse.json({ sceneId: existing.id, token: perm?.token || null, revision: Number(revision?.agent_revision || 0) })
    }

    // New workspace — enforce limit
    if (body.createdBy) {
      const count = await DB.prepare(
        `SELECT COUNT(*) as count FROM scenes WHERE created_by = ? AND owner_type = ?`
      ).bind(body.createdBy, ownerType).first()

      if (count && count.count >= maxWorkspaces) {
        return NextResponse.json({
          error: 'WORKSPACE_LIMIT',
          message: `You can have at most ${maxWorkspaces} workspace${maxWorkspaces > 1 ? 's' : ''}. Delete an existing workspace to create a new one.`,
          maxWorkspaces,
          currentCount: count.count,
        }, { status: 429 })
      }
    }

    const sceneId = crypto.randomUUID()
    const token = generateToken()
    const permissionId = crypto.randomUUID()
    const sizeBytes = new Blob([body.encryptedData]).size

    await DB.batch([
      DB.prepare(
        `INSERT INTO scenes (id, session_id, workspace_name, encrypted_data, permission, created_by, size_bytes, owner_type, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        sceneId,
        body.sessionId,
        workspaceName,
        body.encryptedData,
        body.permission || 'view',
        body.createdBy || null,
        sizeBytes,
        ownerType
      ),
      DB.prepare(
        `INSERT INTO scene_permissions (id, scene_id, token, permission)
         VALUES (?, ?, ?, ?)`
      ).bind(
        permissionId,
        sceneId,
        token,
        body.permission || 'view'
      ),
    ])

    return NextResponse.json({ sceneId, token, revision: 0 }, { status: 201 })
  } catch (err) {
    console.error('[api/scenes/save] Error:', err)
    return NextResponse.json({ error: 'Failed to save scene' }, { status: 500 })
  }
}
