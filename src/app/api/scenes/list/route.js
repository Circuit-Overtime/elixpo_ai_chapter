import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'

export const runtime = 'edge'

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings()
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const guestId = url.searchParams.get('guestId')

    if (!userId && !guestId) {
      return NextResponse.json({ error: 'Missing userId or guestId' }, { status: 400 })
    }

    const identifier = userId || guestId
    const ownerType = userId ? 'user' : 'guest'

    const scenes = await DB.prepare(
      `SELECT s.id, s.session_id, s.workspace_name, s.created_at, s.updated_at,
              s.last_accessed_at, s.size_bytes, s.view_count,
              (SELECT COUNT(*) FROM mcp_workspace_grants mg
               WHERE mg.scene_id = s.id AND mg.revoked_at IS NULL
                 AND mg.expires_at > datetime('now')) AS active_mcp_grants,
              sp.token, wi.mode AS template_mode,
              CASE WHEN wi.mode = 'fork' AND wt.status = 'published' THEN wt.slug ELSE NULL END AS template_slug,
              CASE WHEN wi.mode = 'fork' THEN wt.title ELSE NULL END AS template_title
       FROM scenes s
       LEFT JOIN scene_permissions sp ON sp.scene_id = s.id
       LEFT JOIN workspace_template_instances wi ON wi.scene_id = s.id
       LEFT JOIN workspace_templates wt ON wt.id = wi.template_id
       WHERE s.created_by = ? AND s.owner_type = ?
       ORDER BY s.last_accessed_at DESC`
    ).bind(identifier, ownerType).all()

    let tier = 'guest'
    if (userId) {
      const user = await DB.prepare(`SELECT tier FROM users WHERE id = ?`).bind(userId).first()
      tier = normalizePlanTier(user?.tier, true)
    }
    const maxWorkspaces = getPlanLimits(tier).workspaces

    return NextResponse.json({
      workspaces: scenes.results || [],
      maxWorkspaces,
      count: scenes.results?.length || 0,
    })
  } catch (err) {
    console.error('[api/scenes/list] Error:', err)
    return NextResponse.json({ error: 'Failed to list workspaces' }, { status: 500 })
  }
}
