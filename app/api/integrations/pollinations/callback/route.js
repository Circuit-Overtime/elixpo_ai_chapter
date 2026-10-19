export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import { exchangeCode, inspectPollinationsToken, pollinationsEnabled, savePollinationsConnection } from '../../../../../lib/pollinations';

function finish(request, result, reference = '') {
  const savedNext = request.cookies.get('pollinations_oauth_next')?.value || '';
  const destination = new URL(savedNext.startsWith('/') && !savedNext.startsWith('//') ? savedNext : '/settings?tab=integrations', request.url);
  destination.searchParams.set('pollinations', result);
  if (reference) destination.searchParams.set('pollinations_ref', reference);
  const response = NextResponse.redirect(destination);
  response.cookies.delete('pollinations_oauth_state');
  response.cookies.delete('pollinations_oauth_verifier');
  response.cookies.delete('pollinations_oauth_next');
  return response;
}

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.redirect(new URL('/sign-in', request.url));
  if (!pollinationsEnabled()) return finish(request, 'disabled');
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return finish(request, url.searchParams.get('error') === 'access_denied' ? 'denied' : 'authorization_failed');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get('pollinations_oauth_state')?.value;
  const verifier = request.cookies.get('pollinations_oauth_verifier')?.value;
  if (!code || !state || !savedState || state !== savedState || !verifier) return finish(request, 'invalid_state');

  const reference = crypto.randomUUID().slice(0, 8);
  try {
    const tokens = await exchangeCode({ code, verifier, origin: url.origin });
    const inspection = await inspectPollinationsToken(tokens.access_token);
    await savePollinationsConnection(getDB(), session.userId, tokens, inspection);
    return finish(request, 'connected');
  } catch (error) {
    console.error(`[pollinations/oauth] callback failed code=${error?.code || 'unknown'} ref=${reference}`);
    return finish(request, error?.code === 'usage_scope_required' ? 'scope_missing' : 'failed', reference);
  }
}
