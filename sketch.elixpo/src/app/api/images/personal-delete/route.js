import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import { getCloudinaryConnection } from '@/lib/cloudinaryConnections'
import { deleteFromPersonalCloudinary } from '@/lib/personalCloudinary'

export const runtime = 'edge'

export async function DELETE(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const body = await request.json()
    if (!body.publicId) return NextResponse.json({ error: 'Missing publicId' }, { status: 400 })
    const { DB } = getCloudflareBindings()
    const asset = await DB.prepare(`
      SELECT public_id FROM image_assets
      WHERE public_id = ? AND uploaded_by = ? AND storage_provider = 'user_cloudinary'
    `).bind(body.publicId, user.id).first()
    if (!asset) return NextResponse.json({ error: 'Personal image not found' }, { status: 404 })
    const connection = await getCloudinaryConnection(DB, user.id, { includeDisabled: true })
    if (!connection) return NextResponse.json({ error: 'Cloudinary connection unavailable' }, { status: 409 })
    await deleteFromPersonalCloudinary(body.publicId, {
      cloudName: connection.cloudName,
      oauthToken: connection.oauthToken,
    })
    await DB.prepare(`DELETE FROM image_assets WHERE public_id = ?`).bind(body.publicId).run()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[personal-cloudinary/delete] Error:', error?.message || error)
    return NextResponse.json({ error: 'Personal image deletion failed' }, { status: 502 })
  }
}
