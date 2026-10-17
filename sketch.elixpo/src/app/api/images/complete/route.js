import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function POST(request) {
  try {
    const body = await request.json()
    if (!body.sessionId || !body.publicId) {
      return NextResponse.json({ error: 'Missing image identity' }, { status: 400 })
    }
    const { DB } = getCloudflareBindings()
    const asset = await DB.prepare(
      `SELECT public_id FROM image_assets WHERE public_id = ? AND session_id = ?`
    ).bind(body.publicId, body.sessionId).first()
    if (!asset) return NextResponse.json({ error: 'Unknown image reservation' }, { status: 404 })

    const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0))
    await DB.prepare(
      `UPDATE image_assets SET size_bytes = MAX(size_bytes, ?), status = 'complete', updated_at = datetime('now')
       WHERE public_id = ? AND session_id = ?`
    ).bind(sizeBytes, body.publicId, body.sessionId).run()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/images/complete] Error:', error)
    return NextResponse.json({ error: 'Failed to record image upload' }, { status: 500 })
  }
}
