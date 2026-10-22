import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  getPollinationsConnection,
  getPollinationsConnectionStatus,
} from '@/lib/pollinationsConnections'
import { getPollinationsAccountSnapshot } from '@/lib/pollinationsAccount'

export const runtime = 'edge'

async function context(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return null
  return { user, DB: getCloudflareBindings().DB }
}

export async function GET(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const status = await getPollinationsConnectionStatus(ctx.DB, ctx.user.id)
  if (!status.connected) return NextResponse.json(status)

  if (new URL(request.url).searchParams.get('includeUsage') === '1' && !status.expired) {
    try {
      const connection = await getPollinationsConnection(ctx.DB, ctx.user.id, { includeDisabled: true })
      status.account = await getPollinationsAccountSnapshot(connection.accessToken)
    } catch (error) {
      console.warn('[pollinations/integration] Account lookup failed:', error?.message || error)
      status.accountUnavailable = true
    }
  }
  return NextResponse.json(status)
}

export async function PATCH(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.usePersonalPollen !== 'boolean') {
    return NextResponse.json({ error: 'usePersonalPollen must be a boolean' }, { status: 400 })
  }
  const result = await ctx.DB.prepare(`
    UPDATE pollinations_connections SET enabled = ?, updated_at = ? WHERE user_id = ?
  `).bind(body.usePersonalPollen ? 1 : 0, Math.floor(Date.now() / 1000), ctx.user.id).run()
  if (!result.meta?.changes) return NextResponse.json({ error: 'No Pollinations connection found' }, { status: 404 })
  return NextResponse.json(await getPollinationsConnectionStatus(ctx.DB, ctx.user.id))
}

export async function DELETE(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  await ctx.DB.prepare('DELETE FROM pollinations_connections WHERE user_id = ?').bind(ctx.user.id).run()
  return NextResponse.json({
    ...(await getPollinationsConnectionStatus(ctx.DB, ctx.user.id)),
    revokeUrl: 'https://enter.pollinations.ai/keys',
  })
}
