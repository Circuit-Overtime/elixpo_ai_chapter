import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { createUrlForUser } from '@/lib/create-url';
import { requireSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;

  const limited = await rateLimit(request, 'qr:track', 10, 60);
  if (limited) return limited;

  const user = await resolveUser(request, 'write');
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to create a tracked QR code', account_required: true },
      { status: 401 },
    );
  }
  if (user.tier === 'free') {
    return NextResponse.json(
      { error: 'Tracked QR codes require Pro or Business' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { url?: unknown; title?: unknown }
    | null;
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  return createUrlForUser(user, {
    url: body.url,
    title: body.title || 'Tracked QR code',
    campaign: 'qr-generator',
    tags: ['qr'],
  });
}
