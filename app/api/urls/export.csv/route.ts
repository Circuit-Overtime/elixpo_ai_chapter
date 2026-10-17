import { type NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import type { UrlRecord } from '@/lib/types';

export const runtime = 'edge';

/**
 * GET /api/urls/export.csv
 *
 * Streams the caller's complete URL list as CSV. Per-user only (the
 * authenticated user's own links). Pulls every column except the internal
 * ID so the export is meaningful to humans.
 *
 * Memory-bounded: even for max-tier users (5000 links on Business),
 * the in-memory CSV stays under ~500KB. For a future enterprise tier
 * with -1 (unlimited) we'd switch to streaming row batches.
 */
export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDB();
  const { results } = await db
    .prepare(
      'SELECT short_code, original_url, title, campaign, tags, clicks, is_active, expires_at, created_at, updated_at FROM urls WHERE user_id = ? ORDER BY created_at DESC',
    )
    .bind(user.id)
    .all<UrlRecord>();

  const header = [
    'short_code',
    'original_url',
    'title',
    'campaign',
    'tags',
    'clicks',
    'is_active',
    'expires_at',
    'created_at',
    'updated_at',
  ];

  const rows = (results || []).map((u) => [
    u.short_code,
    u.original_url,
    u.title || '',
    u.campaign || '',
    u.tags || '',
    String(u.clicks ?? 0),
    String(u.is_active ?? 0),
    u.expires_at || '',
    u.created_at,
    u.updated_at || '',
  ]);

  const csv = toCsv([header, ...rows]);
  const filename = `elixpourl-links-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ── CSV helpers ───────────────────────────────────────────────────────────
// Tiny inline CSV writer — handles quoting + escaping per RFC 4180.
// Avoids a dep for ~15 lines of code.

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  // Quote if the cell contains a comma, quote, or CR/LF. Escape internal
  // quotes by doubling them. Otherwise leave as-is.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
