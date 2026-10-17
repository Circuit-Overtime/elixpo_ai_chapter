import { type NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB, getKV } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'edge';

const MAX_BULK = 100;

/**
 * POST /api/urls/bulk-delete
 *
 * Body: { codes: string[] }
 *
 * Deletes up to MAX_BULK of the caller's short links in one D1 batch.
 * Returns the per-code outcome so the UI can show which ones disappeared
 * vs. didn't exist. KV cache is invalidated for every code regardless of
 * whether the D1 row was found — defends against ghost cache entries.
 */
export async function POST(request: NextRequest) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  const limited = await rateLimit(request, 'url:bulk-delete', 6, 60);
  if (limited) return limited;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const codes = body?.codes;
  if (!Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json(
      { error: 'codes must be a non-empty array' },
      { status: 400 },
    );
  }
  if (codes.length > MAX_BULK) {
    return NextResponse.json(
      { error: `bulk-delete accepts at most ${MAX_BULK} codes per call` },
      { status: 400 },
    );
  }
  // Dedupe + type-narrow
  const unique = Array.from(
    new Set(codes.filter((c: unknown): c is string => typeof c === 'string')),
  );
  if (unique.length === 0) {
    return NextResponse.json(
      { error: 'codes must contain strings' },
      { status: 400 },
    );
  }

  const db = getDB();
  const kv = getKV();

  // Single DELETE with IN(...) on owner — D1 prepares parameter binding
  // up to a reasonable limit; MAX_BULK keeps us well clear.
  const placeholders = unique.map(() => '?').join(',');
  await db
    .prepare(
      `UPDATE subdomains
       SET revision = revision + 1, updated_at = datetime('now')
       WHERE id IN (
         SELECT DISTINCT dl.subdomain_id
         FROM subdomain_links dl
         JOIN urls u ON u.id = dl.url_id
         WHERE u.user_id = ? AND u.short_code IN (${placeholders})
       )`,
    )
    .bind(user.id, ...unique)
    .run();
  const result = await db
    .prepare(
      `DELETE FROM urls WHERE user_id = ? AND short_code IN (${placeholders})`,
    )
    .bind(user.id, ...unique)
    .run();

  // Bust every requested code from KV. Missing-from-D1 codes are fine —
  // KV delete is a no-op when the key isn't there.
  await Promise.all(unique.map((c) => kv.delete(`url:${c}`).catch(() => {})));

  auditLog(user.id, 'url.bulk_delete', 'url', unique.join(',')).catch(() => {});

  return NextResponse.json({
    requested: unique.length,
    deleted: result.meta?.changes || 0,
  });
}
