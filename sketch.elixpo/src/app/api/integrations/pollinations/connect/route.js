import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  buildPollinationsAuthorizationUrl,
  createPkceChallenge,
  createPkceVerifier,
  sealPollinationsOAuthContext,
} from '@/lib/pollinationsOAuth'

export const runtime = 'edge'

export async function GET(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('next', '/profile?tab=integrations')
    return NextResponse.redirect(signInUrl)
  }

  try {
    const state = crypto.randomUUID()
    const verifier = createPkceVerifier()
    const challenge = await createPkceChallenge(verifier)
    const requestUrl = new URL(request.url)
    const authorizationUrl = await buildPollinationsAuthorizationUrl({
      origin: requestUrl.origin,
      state,
      challenge,
    })
    const response = NextResponse.redirect(authorizationUrl)
    response.cookies.set('pollinations_oauth_context', await sealPollinationsOAuthContext({ user, state, verifier }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    })
    return response
  } catch (error) {
    console.error('[pollinations/oauth] Could not start authorization:', error?.message || error)
    return NextResponse.redirect(new URL('/settings?tab=integrations&pollinations=config_error', request.url))
  }
}
