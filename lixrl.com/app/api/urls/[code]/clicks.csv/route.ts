import { type NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';
import { pruneUserClicks } from '@/lib/analytics-retention';

export const runtime = 'edge';

/**
 * GET /api/urls/[code]/clicks.csv
 *
 * Per-URL click event export. One row per click within the user's
 * tier-allowed retention window. Returns a 403 for free-tier users
 * since detailed analytics is a Pro+ feature.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limits = TIER_LIMITS[user.tier];
  if (!limits.analytics) {
    return NextResponse.json(
      { error: 'Click export requires Pro tier or above' },
      { status: 403 },
    );
  }

  const { code } = await params;
  const db = getDB();
  await pruneUserClicks(user.id, limits.maxClicksRetention);

  const url = await db
    .prepare('SELECT id FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id)
    .first<{ id: number }>();

  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Retention window per tier
  const since = new Date(
    Date.now() - limits.maxClicksRetention * 86400000,
  ).toISOString();

  const { results } = await db
    .prepare(
      `SELECT clicked_at, country, city, region, device, browser, os, referer, ip_hash
       FROM clicks
       WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0
       ORDER BY clicked_at DESC`,
    )
    .bind(url.id, since)
    .all<{
      clicked_at: string;
      country: string | null;
      city: string | null;
      region: string | null;
      device: string;
      browser: string;
      os: string;
      referer: string | null;
      ip_hash: string | null;
    }>();

  const header = [
    'clicked_at',
    'country',
    'city',
    'region',
    'device',
    'browser',
    'os',
    'referer',
    'ip_hash',
  ];

  const rows = (results || []).map((r) => [
    r.clicked_at,
    r.country || '',
    r.city || '',
    r.region || '',
    r.device,
    r.browser,
    r.os,
    r.referer || '',
    r.ip_hash || '',
  ]);

  const csv = toCsv([header, ...rows]);
  const filename = `elixpourl-${code}-clicks-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
