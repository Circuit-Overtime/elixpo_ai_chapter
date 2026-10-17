import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

const AI_LIMITS = {
  guest: 5,
  free: 10,
  pro: 50,
  team: -1,
}

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings()
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const guestId = url.searchParams.get('guestId')

    if (!userId && !guestId) {
      return NextResponse.json({ error: 'Missing userId or guestId' }, { status: 400 })
    }

    if (!DB) {
      console.warn('[api/ai/quota] D1 binding missing. Returning default local quota.')
      return NextResponse.json({
        used: 0,
        limit: 10,
        remaining: 10,
        tier: 'free',
      })
    }

    let tier = 'guest'
    if (userId) {
      const user = await DB.prepare(
        `SELECT tier FROM users WHERE id = ?`
      ).bind(userId).first()
      tier = user?.tier || 'free'
    }

    const limit = AI_LIMITS[tier] ?? 10
    const col = userId ? 'user_id' : 'guest_id'
    const identifier = userId || guestId

    const result = await DB.prepare(
      `SELECT COUNT(*) as count FROM ai_usage
       WHERE ${col} = ? AND used_at >= date('now')`
    ).bind(identifier).first()

    const used = result?.count || 0

    return NextResponse.json({
      used,
      limit: limit === -1 ? 'unlimited' : limit,
      remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - used),
      tier,
    })
  } catch (err) {
    console.error('[api/ai/quota] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch AI quota' }, { status: 500 })
  }
}
