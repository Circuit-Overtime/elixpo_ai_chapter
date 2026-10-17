import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizeUrl, getCurrentUser } from '@/lib/auth';
import { getKV } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'));
  // Validate the session rather than trusting cookie presence. A stale cookie
  // must be allowed to start a fresh OAuth flow instead of causing a loop.
  if (await getCurrentUser()) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  // 10 login attempts per minute per IP
  const limited = await rateLimit(request, 'login', 10, 60);
  if (limited) return limited;

  const state = crypto.randomUUID();
  const kv = getKV();
  await kv.put(
    `oauth_state:${state}`,
    JSON.stringify({ returnTo }),
    { expirationTtl: 600 },
  );
  return NextResponse.redirect(getAuthorizeUrl(state, request.url));
}
