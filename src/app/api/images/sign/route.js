import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'

export const runtime = 'edge'

export async function POST(request) {
  try {
    const body = await request.json()

    if (!body.sessionId || !Number(body.sizeBytes)) {
      return NextResponse.json({ error: 'Missing sessionId or image size' }, { status: 400 })
    }

    const { DB } = getCloudflareBindings()
    const requestedBytes = Math.max(0, Math.floor(Number(body.sizeBytes)))
    const scene = await DB.prepare(`SELECT created_by, owner_type FROM scenes WHERE session_id = ?`)
      .bind(body.sessionId).first()
    let tier = 'guest'
    if (scene?.owner_type === 'user' && scene.created_by) {
      const user = await DB.prepare(`SELECT tier FROM users WHERE id = ?`).bind(scene.created_by).first()
      tier = normalizePlanTier(user?.tier, true)
    }
    const limitBytes = getPlanLimits(tier).imageBytesPerWorkspace
    const usage = await DB.prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM image_assets
       WHERE session_id = ? AND storage_provider = 'platform_cloudinary'
         AND (status = 'complete' OR created_at >= datetime('now', '-1 hour'))`
    ).bind(body.sessionId).first()
    if ((usage?.total || 0) + requestedBytes > limitBytes) {
      return NextResponse.json({
        error: 'IMAGE_LIMIT',
        message: `This workspace allows ${Math.round(limitBytes / (1024 * 1024))} MB of images.`,
        usedBytes: usage?.total || 0,
        limitBytes,
      }, { status: 429 })
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const folder = `lixsketch/${body.sessionId}`
    const publicId = `${folder}/${body.filename || `img_${timestamp}`}`

    await DB.prepare(
      `INSERT INTO image_assets (public_id, session_id, size_bytes, status, storage_provider)
       VALUES (?, ?, ?, 'pending', 'platform_cloudinary')
       ON CONFLICT(public_id) DO UPDATE SET size_bytes = excluded.size_bytes, updated_at = datetime('now')`
    ).bind(publicId, body.sessionId, requestedBytes).run()

    const apiSecret = process.env.CLOUDINARY_KEY_SECRET
    const apiKey = process.env.CLOUDINARY_KEY_

    // Generate Cloudinary signature (SHA-256 HMAC)
    const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(paramsToSign + apiSecret))
    const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    return NextResponse.json({
      signature,
      timestamp,
      apiKey,
      folder,
      publicId,
      cloudName: 'elixpo',
    })
  } catch (err) {
    console.error('[api/images/sign] Error:', err)
    return NextResponse.json({ error: 'Failed to generate upload signature' }, { status: 500 })
  }
}
