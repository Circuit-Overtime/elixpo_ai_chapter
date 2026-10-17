import { type NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { validateSlug } from '@/lib/validate';

export const runtime = 'edge';

/**
 * GET /api/urls/check?slug=foo
 *
 * Live availability check for the frontend "Slug" input. Cheap, public-ish
 * (still requires auth + heavy rate limit so it can't be used as an
 * enumeration oracle).
 *
 * Returns:
 *   { available: true,  reason: null }
 *   { available: false, reason: "...human message..." }
 *
 * The reasons map to the same checks validateSlug runs server-side at
 * create time:
 *   - "format"   — bad characters / length
 *   - "reserved" — collides with an internal route
 *   - "nsfw"     — matches the safe-content denylist
 *   - "taken"    — another user has it
 */
export async function GET(request: NextRequest) {
  // Heavy rate limit — this is a typing-feedback endpoint, easy to abuse
  // for enumeration. 60 reqs/min is plenty for a single typist.
  const limited = await rateLimit(request, 'url:check', 60, 60);
  if (limited) return limited;

  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = (new URL(request.url).searchParams.get('slug') || '').trim();
  if (!slug) {
    return NextResponse.json({ available: false, reason: 'Provide a slug' });
  }

  // Static checks first — no DB needed
  const slugErr = validateSlug(slug);
  if (slugErr) {
    return NextResponse.json({ available: false, reason: slugErr });
  }

  // DB uniqueness check
  const existing = await getDB()
    .prepare('SELECT 1 FROM urls WHERE short_code = ? LIMIT 1')
    .bind(slug)
    .first();

  if (existing) {
    return NextResponse.json({
      available: false,
      reason: 'That slug is already taken',
    });
  }

  return NextResponse.json({ available: true, reason: null });
}
