export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { authorizationUrl, pkceChallenge, pollinationsEnabled, randomVerifier } from '../../../../../lib/pollinations';

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.redirect(new URL('/sign-in?next=/settings?tab=integrations', request.url));
  if (!pollinationsEnabled()) return NextResponse.redirect(new URL('/settings?tab=integrations&pollinations=disabled', request.url));
  try {
    const state = randomVerifier(32);
    const verifier = randomVerifier(64);
    const challenge = await pkceChallenge(verifier);
    const url = new URL(request.url);
    const requestedNext = url.searchParams.get('next') || '';
    const safeNext = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/settings?tab=integrations';
    const response = NextResponse.redirect(authorizationUrl({ origin: url.origin, state, challenge }));
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' };
    response.cookies.set('pollinations_oauth_state', state, options);
    response.cookies.set('pollinations_oauth_verifier', verifier, options);
    response.cookies.set('pollinations_oauth_next', safeNext, options);
    return response;
  } catch (error) {
    console.error('[pollinations/oauth] start failed:', error?.message || error);
    return NextResponse.redirect(new URL('/settings?tab=integrations&pollinations=config_error', request.url));
  }
}
