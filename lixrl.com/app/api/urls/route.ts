import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { type UrlRecord } from '@/lib/types';
import { clampInt } from '@/lib/validate';
import { requireSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/ratelimit';
import { createUrlForUser } from '@/lib/create-url';
import { deriveGuestRiskIdentity } from '@/lib/guest-risk';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  // CSRF defense-in-depth (Lax cookie already blocks the common vector)
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  // 30 URL creations per minute per IP
  const limited = await rateLimit(request, 'url:create', 30, 60);
  if (limited) return limited;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as import('@/lib/create-url').CreateUrlInput | null;
  if (!body) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });

  const secret = getEnv().GUEST_FINGERPRINT_SECRET;
  const risk = user.tier === 'free' && secret
    ? await deriveGuestRiskIdentity(request, secret)
    : undefined;
  return createUrlForUser(user, body, risk);
}

export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDB();
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get('limit'), 50, 1, 100);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);
  const search = (url.searchParams.get('search') || '').slice(0, 100); // cap search length

  let query = 'SELECT * FROM urls WHERE user_id = ?';
  const params: any[] = [user.id];

  if (search) {
    // Escape LIKE wildcards in user input
    const escaped = search.replace(/[%_]/g, '\\$&');
    const like = `%${escaped}%`;
    query += " AND (short_code LIKE ? ESCAPE '\\' OR original_url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR campaign LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')";
    params.push(like, like, like, like, like);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [{ results }, total] = await Promise.all([
    db.prepare(query).bind(...params).all<UrlRecord>(),
    db.prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
      .bind(user.id).first<{ count: number }>(),
  ]);

  return NextResponse.json({ urls: results, total: total?.count || 0, limit, offset });
}
