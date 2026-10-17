import { NextResponse } from 'next/server'
import { getUserForAccessToken, readAuthBearerToken, readAuthCookie } from '@/lib/serverAuth'

export const runtime = 'edge'

const ELIXPO_AUTH_URL = 'https://accounts.elixpo.com'
const SESSION_MAX_AGE = 7 * 24 * 60 * 60
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

function clearSession(response) {
  response.cookies.delete('lixsketch-session')
  response.cookies.delete('lixsketch-refresh-token')
  return response
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken || !process.env.NEXT_PUBLIC_ELIXPO_AUTH_CLIENT_ID) return null
  try {
    const response = await fetch(`${ELIXPO_AUTH_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.NEXT_PUBLIC_ELIXPO_AUTH_CLIENT_ID,
      }),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const tokens = await response.json()
    return tokens?.access_token ? tokens : null
  } catch {
    return null
  }
}

export async function GET(request) {
  const saved = readAuthCookie(request)
  const bearerToken = readAuthBearerToken(request)
  let sessionToken = bearerToken || saved?.sessionToken || null
  let user = await getUserForAccessToken(sessionToken, saved?.user)
  let refreshed = null

  if (!user) {
    refreshed = await refreshAccessToken(request.cookies.get('lixsketch-refresh-token')?.value)
    sessionToken = refreshed?.access_token || null
    user = await getUserForAccessToken(sessionToken, saved?.user)
  }

  if (!user || !sessionToken) {
    return clearSession(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }))
  }

  const response = NextResponse.json({ sessionToken, user }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set('lixsketch-session', JSON.stringify({ sessionToken, user }), cookieOptions(SESSION_MAX_AGE))
  if (refreshed?.refresh_token) {
    response.cookies.set('lixsketch-refresh-token', refreshed.refresh_token, cookieOptions(REFRESH_MAX_AGE))
  }
  return response
}

export async function DELETE() {
  return clearSession(NextResponse.json({ signedOut: true }))
}
