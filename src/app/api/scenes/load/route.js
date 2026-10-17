import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function GET(request) {
  try {
    let DB;
    try {
      const bindings = getCloudflareBindings()
      DB = bindings.DB
    } catch {
      return NextResponse.json({ encryptedData: null, error: 'Local dev: DB unavailable' }, { status: 200 })
    }

    if (!DB) {
      return NextResponse.json({ encryptedData: null, error: 'Local dev: DB unavailable' }, { status: 200 })
    }

    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const sessionId = url.searchParams.get('sessionId')
    const shouldTouch = url.searchParams.get('touch') !== '0'
    const metadataOnly = url.searchParams.get('meta') === '1'

    if (!token && !sessionId) {
      return NextResponse.json({ error: 'Missing token or sessionId' }, { status: 400 })
    }

    let perm
    
    if (token) {
      perm = await DB.prepare(
        `SELECT sp.permission, s.encrypted_data, s.workspace_name, s.session_id, s.updated_at, s.agent_revision,
                (SELECT slug FROM workspace_templates WHERE source_session_id = s.session_id LIMIT 1) AS template_slug,
                (SELECT status FROM workspace_templates WHERE source_session_id = s.session_id LIMIT 1) AS template_status
         FROM scene_permissions sp
         JOIN scenes s ON sp.scene_id = s.id
         WHERE sp.token = ?`
      ).bind(token).first()
    } else if (sessionId) {
      // Intentional bypass: querying by sessionId directly allows owners/initial creators
      // to load the scene from their local storage or URL without needing a share token.
      perm = await DB.prepare(
        `SELECT permission, encrypted_data, workspace_name, session_id, updated_at, agent_revision,
                (SELECT slug FROM workspace_templates WHERE source_session_id = session_id LIMIT 1) AS template_slug,
                (SELECT status FROM workspace_templates WHERE source_session_id = session_id LIMIT 1) AS template_status
         FROM scenes
         WHERE session_id = ?`
      ).bind(sessionId).first()
    }

    if (!perm) {
      // A canvas URL can still have a valid local autosave even when it has
      // never been synced (or its cloud row expired). This is normal state,
      // not a failed request. Token-based share links still return 404.
      if (sessionId) {
        return NextResponse.json({ encryptedData: null, missing: true })
      }
      return NextResponse.json({ error: 'Scene not found or link expired' }, { status: 404 })
    }

    // Increment view count and update last accessed time
    if (shouldTouch) {
      await DB.prepare(
        `UPDATE scenes SET view_count = view_count + 1, last_accessed_at = datetime('now') WHERE session_id = ?`
      ).bind(perm.session_id).run()
    }

    return NextResponse.json({
      encryptedData: metadataOnly ? undefined : perm.encrypted_data,
      permission: perm.permission,
      workspaceName: perm.workspace_name,
      updatedAt: perm.updated_at,
      revision: Number(perm.agent_revision || 0),
      lastAccessedAt: shouldTouch ? new Date().toISOString() : undefined,
      templateSlug: perm.template_slug || null,
      templateStatus: perm.template_status || null,
    })
  } catch (err) {
    console.error('[api/scenes/load] Error:', err)
    return NextResponse.json({ error: 'Failed to load scene' }, { status: 500 })
  }
}
