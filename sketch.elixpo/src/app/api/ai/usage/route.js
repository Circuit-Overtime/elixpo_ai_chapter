import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

const AI_LIMITS = {
  guest: 5,
  free: 10,
  pro: 50,
  team: -1,
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings()
    const body = await request.json()

    if (!body.userId && !body.guestId) {
      return NextResponse.json({ error: 'Missing userId or guestId' }, { status: 400 })
    }

    if (!DB) {
      console.warn('[api/ai/usage] D1 binding missing. Skipping DB insert and assuming local dev quota.')
      return NextResponse.json({
        used: 1,
        limit: 10,
        remaining: 9,
      })
    }

    let tier = 'guest'
    if (body.userId) {
      const user = await DB.prepare(
        `SELECT tier FROM users WHERE id = ?`
      ).bind(body.userId).first()
      tier = user?.tier || 'free'
    }

    const limit = AI_LIMITS[tier] ?? 10
    const col = body.userId ? 'user_id' : 'guest_id'
    const identifier = body.userId || body.guestId

    // Check current usage
    const result = await DB.prepare(
      `SELECT COUNT(*) as count FROM ai_usage
       WHERE ${col} = ? AND used_at >= date('now')`
    ).bind(identifier).first()

    const used = result?.count || 0

    if (limit !== -1 && used >= limit) {
      return NextResponse.json(
        { error: 'Daily AI limit reached', quotaExceeded: true, used, limit },
        { status: 429 }
      )
    }

    // Record usage
    const id = crypto.randomUUID()
    await DB.prepare(
      `INSERT INTO ai_usage (id, user_id, guest_id, mode) VALUES (?, ?, ?, ?)`
    ).bind(id, body.userId || null, body.guestId || null, body.mode || 'lixscript').run()

    return NextResponse.json({
      used: used + 1,
      limit: limit === -1 ? 'unlimited' : limit,
      remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - used - 1),
    })
  } catch (err) {
    console.error('[api/ai/usage] Error:', err)
    return NextResponse.json({ error: 'Failed to record AI usage' }, { status: 500 })
  }
}
