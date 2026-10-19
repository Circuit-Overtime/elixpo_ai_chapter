import { cookies } from 'next/headers'
import { bindings, config, originFor } from '@/lib/cloudflare'
import { randomToken } from '@/lib/encoding'

export interface User {
  id: string
  email: string
  displayName: string
}

interface AccountsUser {
  id: string
  email: string
  displayName?: string
}

export async function currentUser(): Promise<User | null> {
  const session = (await cookies()).get('crumb_session')?.value
  if (!session) return null
  const row = await (await bindings()).DB.prepare(`
    SELECT users.id, users.email, users.display_name
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > unixepoch()
  `).bind(session).first<{ id: string; email: string; display_name: string }>()
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const session = cookieStore.get('crumb_session')?.value
  if (session) {
    await (await bindings()).DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session).run()
  }
  cookieStore.delete('crumb_session')
}

export async function accountsAuthorizeUrl(state: string, requestUrl: string): Promise<string> {
  const env = await config()
  const url = new URL('/oauth/authorize', env.accountsOrigin)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.accountsClientId,
    redirect_uri: `${originFor(requestUrl)}/auth/callback`,
    state,
    scope: 'openid profile email',
  }).toString()
  return url.toString()
}

export async function finishAccountsLogin(code: string, requestUrl: string, userAgent = ''): Promise<User> {
  const env = await config()
  const accounts = env.accountsOrigin
  const tokenResponse = await fetch(new URL('/api/auth/token', accounts), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: env.accountsClientId,
      client_secret: env.accountsClientSecret,
      redirect_uri: `${originFor(requestUrl)}/auth/callback`,
    }),
  })
  const tokens = await tokenResponse.json() as { access_token?: string }
  if (!tokenResponse.ok || !tokens.access_token) throw new Error('Accounts token exchange failed')
  const userResponse = await fetch(new URL('/api/auth/me', accounts), {
    headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' },
  })
  const account = await userResponse.json() as AccountsUser
  if (!userResponse.ok || !account.id || !account.email) throw new Error('Accounts profile lookup failed')
  const user = { id: account.id, email: account.email, displayName: account.displayName || account.email }
  const db = (await bindings()).DB
  await db.prepare(`
    INSERT INTO users (id, email, display_name, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).bind(user.id, user.email, user.displayName).run()
  const session = randomToken()
  const publicId = randomToken()
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT INTO sessions
      (id, user_id, expires_at, public_id, created_at, last_seen_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    session,
    user.id,
    now + 15 * 86400,
    publicId,
    now,
    now,
    userAgent.slice(0, 512),
  ).run()
  ;(await cookies()).set('crumb_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 86400,
  })
  return user
}
