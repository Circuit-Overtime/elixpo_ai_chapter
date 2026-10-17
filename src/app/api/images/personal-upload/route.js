import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import { getCloudinaryConnection } from '@/lib/cloudinaryConnections'
import { uploadToPersonalCloudinary } from '@/lib/personalCloudinary'

export const runtime = 'edge'

const MAX_PERSONAL_UPLOAD_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/avif', 'image/bmp', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'])

export async function POST(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    const sessionId = String(form.get('sessionId') || '').trim()
    if (!(file instanceof File) || !sessionId) {
      return NextResponse.json({ error: 'Missing image or workspace' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_PERSONAL_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Unsupported image or file exceeds 20 MB' }, { status: 413 })
    }

    const { DB } = getCloudflareBindings()
    const connection = await getCloudinaryConnection(DB, user.id)
    if (!connection) return NextResponse.json({ error: 'Personal Cloudinary storage is not enabled' }, { status: 409 })

    const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'workspace'
    const folder = `lixsketch/${user.id}/${safeSession}`
    const publicId = `img_${crypto.randomUUID()}`
    const uploaded = await uploadToPersonalCloudinary(file, {
      cloudName: connection.cloudName,
      oauthToken: connection.oauthToken,
      folder,
      publicId,
    })

    await DB.prepare(`
      INSERT INTO image_assets
        (public_id, session_id, size_bytes, status, storage_provider,
         storage_cloud_name, secure_url, uploaded_by)
      VALUES (?, ?, ?, 'complete', 'user_cloudinary', ?, ?, ?)
      ON CONFLICT(public_id) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        status = 'complete',
        storage_provider = excluded.storage_provider,
        storage_cloud_name = excluded.storage_cloud_name,
        secure_url = excluded.secure_url,
        uploaded_by = excluded.uploaded_by,
        updated_at = datetime('now')
    `).bind(
      uploaded.public_id,
      sessionId,
      uploaded.bytes || file.size,
      connection.cloudName,
      uploaded.secure_url,
      user.id,
    ).run()

    return NextResponse.json({
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      sizeBytes: uploaded.bytes || file.size,
      storageProvider: 'user_cloudinary',
      cloudName: connection.cloudName,
    })
  } catch (error) {
    console.error('[personal-cloudinary/upload] Error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Personal Cloudinary upload failed' }, { status: 502 })
  }
}
