import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function DELETE(request) {
  try {
    const { DB } = getCloudflareBindings()
    const body = await request.json()

    // Support two deletion modes:
    // 1. By token + sessionId (existing: revoke share link)
    // 2. By sessionId + createdBy (new: delete workspace from profile)

    if (body.token && body.sessionId) {
      // Mode 1: Delete by share token
      const perm = await DB.prepare(
        `SELECT sp.scene_id, s.session_id
         FROM scene_permissions sp
         JOIN scenes s ON sp.scene_id = s.id
         WHERE sp.token = ?`
      ).bind(body.token).first()

      if (!perm) {
        return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
      }

      if (perm.session_id !== body.sessionId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Delete permissions first, then the scene
      await DB.batch([
        DB.prepare(`DELETE FROM canvas_docs WHERE session_id = ?`).bind(perm.session_id),
        DB.prepare(`DELETE FROM image_assets WHERE session_id = ?`).bind(perm.session_id),
        DB.prepare(`DELETE FROM scene_permissions WHERE scene_id = ?`).bind(perm.scene_id),
        DB.prepare(`DELETE FROM scenes WHERE id = ?`).bind(perm.scene_id),
      ])

      return NextResponse.json({ success: true })
    }

    if (body.sessionId && body.createdBy) {
      // Mode 2: Delete workspace by session_id, verified by owner
      const scene = await DB.prepare(
        `SELECT id, created_by FROM scenes WHERE session_id = ?`
      ).bind(body.sessionId).first()

      if (!scene) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      }

      if (scene.created_by !== body.createdBy) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Delete permissions first, then the scene
      await DB.batch([
        DB.prepare(`DELETE FROM canvas_docs WHERE session_id = ?`).bind(body.sessionId),
        DB.prepare(`DELETE FROM image_assets WHERE session_id = ?`).bind(body.sessionId),
        DB.prepare(`DELETE FROM scene_permissions WHERE scene_id = ?`).bind(scene.id),
        DB.prepare(`DELETE FROM scenes WHERE id = ?`).bind(scene.id),
      ])

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  } catch (err) {
    console.error('[api/scenes/delete] Error:', err)
    return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 })
  }
}
