import { NextResponse } from 'next/server'
import { getCloudflareBindings, generateToken } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'
import { TEMPLATE_DOC_MAX_BYTES, TEMPLATE_SCENE_MAX_BYTES } from '@/lib/workspaceTemplates'

export const runtime = 'edge'

export async function POST(request, context) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Sign in to use this template' }, { status: 401 })
    const { slug } = await context.params
    const { DB } = getCloudflareBindings()
    const template = await DB.prepare(`SELECT id, title FROM workspace_templates WHERE slug = ? AND status = 'published'`).bind(slug).first()
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const body = await request.json()
    const mode = body.mode === 'fork' ? 'fork' : body.mode === 'clone' ? 'clone' : null
    if (!mode || !body.encryptedData) return NextResponse.json({ error: 'A valid copy payload is required' }, { status: 400 })
    if (new Blob([body.encryptedData]).size > TEMPLATE_SCENE_MAX_BYTES ||
        (body.encryptedDocData && new Blob([body.encryptedDocData]).size > TEMPLATE_DOC_MAX_BYTES)) {
      return NextResponse.json({ error: 'The workspace copy is too large' }, { status: 413 })
    }
    const account = await DB.prepare('SELECT tier FROM users WHERE id = ?').bind(user.id).first()
    const tier = normalizePlanTier(account?.tier, true)
    const limit = getPlanLimits(tier).workspaces
    const sceneId = crypto.randomUUID()
    const sessionId = `lx-tpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`
    const permissionId = crypto.randomUUID()
    const instanceId = crypto.randomUUID()
    const token = generateToken()
    const workspaceName = String(body.workspaceName || template.title || 'Template copy').trim().slice(0, 20) || 'Template copy'
    // Keep quota evaluation and insertion in one SQLite statement. Concurrent
    // copy requests therefore cannot both pass a stale preflight count.
    const sceneInsert = await DB.prepare(`INSERT INTO scenes
      (id, session_id, workspace_name, encrypted_data, permission, created_by, size_bytes, owner_type, last_accessed_at)
      SELECT ?, ?, ?, ?, 'edit', ?, ?, 'user', datetime('now')
      WHERE (SELECT COUNT(*) FROM scenes WHERE created_by = ? AND owner_type = 'user') < ?`)
      .bind(sceneId, sessionId, workspaceName, body.encryptedData, user.id,
        new Blob([body.encryptedData]).size, user.id, limit)
      .run()
    if (!sceneInsert.meta?.changes) {
      const count = await DB.prepare(`SELECT COUNT(*) AS count FROM scenes WHERE created_by = ? AND owner_type = 'user'`).bind(user.id).first()
      return NextResponse.json({ error: 'WORKSPACE_LIMIT', message: `Your ${tier} plan allows ${limit} workspace${limit === 1 ? '' : 's'}.`, limit, count: Number(count?.count || 0) }, { status: 429 })
    }
    const statements = [
      DB.prepare(`INSERT INTO scene_permissions (id, scene_id, token, permission) VALUES (?, ?, ?, 'edit')`)
        .bind(permissionId, sceneId, token),
      DB.prepare(`INSERT INTO workspace_template_instances (id, template_id, scene_id, user_id, mode) VALUES (?, ?, ?, ?, ?)`)
        .bind(instanceId, template.id, sceneId, user.id, mode),
      DB.prepare(`UPDATE workspace_templates SET ${mode === 'fork' ? 'fork_count' : 'clone_count'} = ${mode === 'fork' ? 'fork_count' : 'clone_count'} + 1 WHERE id = ?`)
        .bind(template.id),
    ]
    if (body.encryptedDocData) {
      statements.push(DB.prepare(`INSERT INTO canvas_docs (session_id, encrypted_data, created_by, client_id, size_bytes)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(sessionId, body.encryptedDocData, user.id, `template-${instanceId.slice(0, 8)}`, new Blob([body.encryptedDocData]).size))
    }
    try {
      await DB.batch(statements)
    } catch (error) {
      await DB.prepare('DELETE FROM scenes WHERE id = ?').bind(sceneId).run().catch(() => {})
      throw error
    }
    return NextResponse.json({ sceneId, sessionId, workspaceName, mode }, { status: 201 })
  } catch (error) {
    console.error('[api/templates/instantiate] failed:', error)
    return NextResponse.json({ error: 'Could not create workspace from template' }, { status: 500 })
  }
}
