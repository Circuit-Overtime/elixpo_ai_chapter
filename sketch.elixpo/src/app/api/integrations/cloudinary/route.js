import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import { getCloudinaryConnection, getCloudinaryConnectionStatus } from '@/lib/cloudinaryConnections'
import { decryptIntegrationSecret } from '@/lib/integrationSecrets'
import { revokeCloudinaryToken } from '@/lib/cloudinaryOAuth'
import { getPersonalCloudinaryUsage } from '@/lib/personalCloudinary'

export const runtime = 'edge'

async function context(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return null
  return { user, DB: getCloudflareBindings().DB }
}

export async function GET(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const status = await getCloudinaryConnectionStatus(ctx.DB, ctx.user.id)
  const includeUsage = new URL(request.url).searchParams.get('includeUsage') === '1'
  if (status.connected && includeUsage) {
    try {
      const connection = await getCloudinaryConnection(ctx.DB, ctx.user.id, { includeDisabled: true })
      status.providerUsage = await getPersonalCloudinaryUsage({
        cloudName: connection.cloudName,
        oauthToken: connection.oauthToken,
      })
    } catch (error) {
      console.warn('[cloudinary/integration] Usage lookup failed:', error?.message || error)
      status.providerUsageUnavailable = true
    }
  }
  return NextResponse.json(status)
}

export async function PATCH(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.useForUploads !== 'boolean') {
    return NextResponse.json({ error: 'useForUploads must be a boolean' }, { status: 400 })
  }
  const result = await ctx.DB.prepare(
    `UPDATE cloudinary_connections SET enabled = ?, updated_at = ? WHERE user_id = ?`,
  ).bind(body.useForUploads ? 1 : 0, Math.floor(Date.now() / 1000), ctx.user.id).run()
  if (!result.meta?.changes) return NextResponse.json({ error: 'No Cloudinary connection found' }, { status: 404 })
  return NextResponse.json(await getCloudinaryConnectionStatus(ctx.DB, ctx.user.id))
}

export async function DELETE(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const connection = await ctx.DB.prepare(
    `SELECT refresh_token_encrypted FROM cloudinary_connections WHERE user_id = ?`,
  ).bind(ctx.user.id).first()
  if (connection?.refresh_token_encrypted) {
    try {
      const refreshToken = await decryptIntegrationSecret(connection.refresh_token_encrypted, ctx.user.id)
      await revokeCloudinaryToken(refreshToken)
    } catch (error) {
      console.warn('[cloudinary/integration] Token revocation failed:', error?.message || error)
    }
  }
  await ctx.DB.prepare(`DELETE FROM cloudinary_connections WHERE user_id = ?`).bind(ctx.user.id).run()
  return NextResponse.json({
    ...(await getCloudinaryConnectionStatus(ctx.DB, ctx.user.id)),
    postLogoutRedirect: '/settings?tab=integrations',
  })
}
