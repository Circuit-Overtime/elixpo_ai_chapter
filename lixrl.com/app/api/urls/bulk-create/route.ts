import { type NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { createUrlForUser, type CreateUrlInput } from '@/lib/create-url';
import { requireSameOrigin } from '@/lib/csrf';
import { rateLimitSubject } from '@/lib/ratelimit';
import { TIER_LIMITS } from '@/lib/types';

export const runtime = 'edge';

const MAX_BATCH = 25;

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tierRate = TIER_LIMITS[user.tier].rateLimitPerMin;
  const limited = await rateLimitSubject(
    'url:bulk-create',
    String(user.id),
    tierRate === -1 ? -1 : Math.max(1, Math.floor(tierRate / MAX_BATCH)),
    60,
  );
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { links?: CreateUrlInput[] } | null;
  if (!Array.isArray(body?.links) || body.links.length === 0 || body.links.length > MAX_BATCH) {
    return NextResponse.json({ error: `links must contain 1 to ${MAX_BATCH} items` }, { status: 400 });
  }

  const results = [];
  for (let index = 0; index < body.links.length; index += 1) {
    const response = await createUrlForUser(user, body.links[index]);
    results.push({ index, status: response.status, body: await response.json() });
  }
  const created = results.filter((result) => result.status === 201).length;
  return NextResponse.json(
    { requested: results.length, created, results },
    { status: created === results.length ? 201 : 207 },
  );
}
