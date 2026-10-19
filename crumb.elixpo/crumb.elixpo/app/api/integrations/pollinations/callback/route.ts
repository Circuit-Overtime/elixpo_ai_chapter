import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'
import { exchangeCode } from '@/lib/pollinations'
import { encryptToken } from '@/lib/secrets'

interface Context { userId: string; verifier: string }

function finish(requestUrl: string, result: string) {
  return NextResponse.redirect(new URL(`/profile/connectors?pollinations=${result}`, requestUrl))
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') || ''
  const key = `pollinations:${state}`
  const env = await bindings()
  const stored = await env.KV.get(key)
  if (!stored) return NextResponse.redirect(new URL('/?connect=invalid_state', request.url))
  await env.KV.delete(key)
  const context = JSON.parse(stored) as Context
  const code = url.searchParams.get('code')
  if (!code || url.searchParams.has('error')) return finish(request.url, 'denied')
  const user = await currentUser()
  if (!user || user.id !== context.userId) return finish(request.url, 'invalid_session')
  try {
    const tokens = await exchangeCode(code, context.verifier, request.url)
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(`
      INSERT INTO pollinations_connections
        (user_id, access_token_encrypted, token_expires_at, oauth_scope, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        oauth_scope = excluded.oauth_scope,
        updated_at = excluded.updated_at
    `).bind(
      user.id,
      await encryptToken(tokens.access_token, user.id),
      now + (Number(tokens.expires_in) || 7 * 86400),
      tokens.scope || '',
      now,
    ).run()
    return finish(request.url, 'connected')
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8)
    console.error(`[crumb/pollinations] callback failed ref=${reference}`, error instanceof Error ? error.message : 'unknown error')
    return NextResponse.redirect(new URL(`/profile/connectors?pollinations=failed&error_ref=${reference}`, request.url))
  }
}
