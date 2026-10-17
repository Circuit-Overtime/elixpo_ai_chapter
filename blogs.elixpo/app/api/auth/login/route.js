export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/auth';
import { buildOAuthAuthorizeUrl } from '../../../../lib/oauthAuthorize';
import { safeRelativeRedirect } from '../../../../lib/safeRedirect';

// Server-initiated OAuth login. Generates the CSRF `state`, sets it in an
// httpOnly cookie (so client JS can't forge it), and redirects to the
// Elixpo Accounts authorize endpoint. The callback verifies the cookie.
export async function GET(request) {
  const state = crypto.randomUUID();
  const url = new URL(request.url);
  const origin = url.origin;
  const config = getOAuthConfig();

  if (!config.clientId) {
    console.error('[auth/login] NEXT_PUBLIC_ELIXPO_CLIENT_ID is not configured');
    const target = new URL('/auth-error', origin);
    target.searchParams.set('code', 'oauth_not_configured');
    return NextResponse.redirect(target);
  }

  // Post-login redirect target — only same-site relative paths allowed (no open redirect).
  const safeNext = safeRelativeRedirect(url.searchParams.get('next'));

  const res = NextResponse.redirect(buildOAuthAuthorizeUrl({ origin, state, config }));
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' };
  res.cookies.set('oauth_state', state, cookieOpts);
  if (safeNext) res.cookies.set('oauth_next', safeNext, cookieOpts);
  return res;
}
