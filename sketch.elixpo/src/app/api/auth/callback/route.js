export const runtime = 'edge'

import { NextResponse } from 'next/server'

const ELIXPO_AUTH_URL = 'https://accounts.elixpo.com'

// Deduplicate: track codes already exchanged to prevent double-spend
// Stores the resulting redirect URL so duplicate requests get the same outcome
const processedCodes = new Map() // code -> redirectUrl

export async function GET(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')
  const appOrigin = url.origin

  if (error) {
    console.error('[auth/callback] OAuth error:', error, errorDesc)
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, appOrigin))
  }

  if (!code) {
    console.error('[auth/callback] No code in callback')
    return NextResponse.redirect(new URL('/?auth_error=missing_code', appOrigin))
  }

  // If we already processed this code, return the cached redirect
  if (processedCodes.has(code)) {
    console.log('[auth/callback] Duplicate request for same code, returning cached redirect')
    return NextResponse.redirect(new URL(processedCodes.get(code), appOrigin))
  }

  // Mark code as in-flight immediately to block racing duplicates
  processedCodes.set(code, `/?auth_error=duplicate_request`)

  // redirect_uri must match EXACTLY what was sent to /oauth/authorize
  const redirectUri = `${appOrigin}/api/auth/callback`

  console.log('[auth/callback] Exchanging code for tokens...', { code: code.slice(0, 20) + '...', redirectUri })

  // Exchange code for tokens
  let tokenRes
  try {
    tokenRes = await fetch(`${ELIXPO_AUTH_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.NEXT_PUBLIC_ELIXPO_AUTH_CLIENT_ID,
        client_secret: process.env.ELIXPO_AUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    })
  } catch (fetchErr) {
    console.error('[auth/callback] Token fetch failed:', fetchErr)
    return NextResponse.redirect(new URL('/?auth_error=token_fetch_failed', appOrigin))
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => 'unknown')
    console.error('[auth/callback] Token exchange failed:', tokenRes.status, errBody)
    return NextResponse.redirect(new URL(`/?auth_error=token_exchange_failed&detail=${encodeURIComponent(errBody)}`, appOrigin))
  }

  const tokens = await tokenRes.json()
  console.log('[auth/callback] Got tokens, fetching profile...')

  // Fetch user profile using the access_token
  let userRes
  try {
    userRes = await fetch(`${ELIXPO_AUTH_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
  } catch (fetchErr) {
    console.error('[auth/callback] Profile fetch failed:', fetchErr)
    return NextResponse.redirect(new URL('/?auth_error=profile_fetch_failed', appOrigin))
  }

  if (!userRes.ok) {
    const errBody = await userRes.text().catch(() => 'unknown')
    console.error('[auth/callback] Profile fetch error:', userRes.status, errBody)
    return NextResponse.redirect(new URL('/?auth_error=profile_fetch_failed', appOrigin))
  }

  const profile = await userRes.json()
  console.log('[auth/callback] Got profile:', { id: profile.id, email: profile.email, displayName: profile.displayName })

  const sessionUser = {
    id: profile.id || profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    avatar: profile.avatar || null,
    isAdmin: profile.isAdmin || false,
  }
  const userParam = encodeURIComponent(JSON.stringify(sessionUser))

  const sessionToken = tokens.access_token

  const redirectPath = `/?auth_token=${encodeURIComponent(sessionToken)}&auth_user=${userParam}`

  // Cache the successful redirect so duplicate requests get the same result
  processedCodes.set(code, redirectPath)
  // Clean up after 30 seconds
  setTimeout(() => processedCodes.delete(code), 30000)

  const response = NextResponse.redirect(new URL(redirectPath, appOrigin))

  // Establish the browser session for Edge routes immediately. The landing
  // callback also mirrors this into localStorage for client-side restoration.
  response.cookies.set('lixsketch-session', encodeURIComponent(JSON.stringify({
    sessionToken,
    user: sessionUser,
  })), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  if (tokens.refresh_token) {
    response.cookies.set('lixsketch-refresh-token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })
  }

  return response
}
