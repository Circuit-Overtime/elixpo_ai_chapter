import { NextResponse } from 'next/server'
import { verifyDeviceToken } from '@/lib/accounts-device'
import { bindings } from '@/lib/cloudflare'
import { CONNECTOR_MODELS } from '@/lib/model-policy'
import { decryptToken } from '@/lib/secrets'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'accounts_authorization_required' }, { status: 401 })
  let user: { id: string; email: string }
  try {
    user = await verifyDeviceToken(token)
  } catch {
    return NextResponse.json({ error: 'invalid_accounts_authorization' }, { status: 401 })
  }
  const row = await (await bindings()).DB.prepare(`
    SELECT access_token_encrypted, token_expires_at
    FROM pollinations_connections
    WHERE user_id = ? AND token_expires_at > unixepoch()
  `).bind(user.id).first<{
    access_token_encrypted: string
    token_expires_at: number
  }>()
  if (!row) return NextResponse.json({ error: 'pollinations_connector_required', connect_url: '/profile/connectors' }, { status: 409 })
  const accessToken = await decryptToken(row.access_token_encrypted, user.id)
  return NextResponse.json(
    { access_token: accessToken, expires_at: row.token_expires_at, models: CONNECTOR_MODELS },
    { headers: { 'cache-control': 'no-store' } },
  )
}
