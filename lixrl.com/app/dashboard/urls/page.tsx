import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import type { UrlRecord } from '@/lib/types';
import UrlsListClient from './UrlsListClient';

export const runtime = 'edge';

const CARD_STYLE = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
  border: '1px solid rgba(0,0,0,0.10)',
  backdropFilter: 'blur(20px)',
} as const;

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
];

const PAGE_SIZE = 20;

export default async function UrlsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const {
    page: pageParam,
    search: searchParam,
    status: statusParam,
  } = await searchParams;

  const user = (await getCurrentUser())!;
  const db = getDB();
  const page = Math.max(1, Number.parseInt(pageParam || '1') || 1);
  const search = (searchParam || '').slice(0, 100);
  const status: StatusFilter =
    statusParam === 'active' ||
    statusParam === 'inactive' ||
    statusParam === 'expired'
      ? statusParam
      : 'all';
  const offset = (page - 1) * PAGE_SIZE;

  // Build query — proper LIKE-wildcard escaping so a user typing `%` or `_`
  // doesn't get a runaway match. ESCAPE clause uses backslash.
  let where = 'user_id = ?';
  const params: any[] = [user.id];

  if (search) {
    const escaped = search.replace(/[%_]/g, '\\$&');
    const like = `%${escaped}%`;
    where +=
      " AND (short_code LIKE ? ESCAPE '\\' OR original_url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR campaign LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')";
    params.push(like, like, like, like, like);
  }

  if (status === 'active') {
    where += ' AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)';
    params.push(new Date().toISOString());
  } else if (status === 'inactive') {
    where += ' AND is_active = 0';
  } else if (status === 'expired') {
    where += ' AND expires_at IS NOT NULL AND expires_at <= ?';
    params.push(new Date().toISOString());
  }

  const listQuery = `SELECT * FROM urls WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as count FROM urls WHERE ${where}`;

  const [{ results }, total] = await Promise.all([
    db
      .prepare(listQuery)
      .bind(...params, PAGE_SIZE, offset)
      .all<UrlRecord>(),
    db.prepare(countQuery).bind(...params).first<{ count: number }>(),
  ]);

  const totalPages = Math.max(1, Math.ceil((total?.count || 0) / PAGE_SIZE));

  return (
    <div className="w-full max-w-6xl mx-auto py-2 px-2">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-[1.8rem] font-bold text-white tracking-tight">
            My URLs
          </h1>
          <p className="text-sm text-white/55 mt-1">
            {total?.count ?? 0} link{(total?.count ?? 0) === 1 ? '' : 's'}{' '}
            total
            {search ? ` · filtered by "${search}"` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/urls/export.csv"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-medium text-white/85 no-underline transition-colors"
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
            title="Download every link as CSV"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </a>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white no-underline transition-all"
            style={{
              background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
              boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Shorten URL
          </Link>
        </div>
      </div>

      <div className="p-6 rounded-2xl" style={CARD_STYLE}>
        {/* Search + filter chips */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <form method="get" className="flex-1 max-w-md">
            {status !== 'all' && (
              <input type="hidden" name="status" value={status} />
            )}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                name="search"
                placeholder="Search by slug, destination, or title…"
                defaultValue={search}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none text-white placeholder-white/40"
                style={{
                  background: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>
          </form>

          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((f) => {
              const active = f.value === status;
              const params = new URLSearchParams();
              if (search) params.set('search', search);
              if (f.value !== 'all') params.set('status', f.value);
              const href = params.toString()
                ? `/dashboard/urls?${params.toString()}`
                : '/dashboard/urls';
              return (
                <Link
                  key={f.value}
                  href={href}
                  className="text-xs px-3 py-1.5 rounded-lg no-underline transition-colors font-medium"
                  style={{
                    background: active
                      ? 'rgba(229,57,53,0.12)'
                      : 'transparent',
                    color: active ? '#c62828' : 'rgba(0,0,0,0.55)',
                    border: '1px solid',
                    borderColor: active
                      ? 'rgba(229,57,53,0.4)'
                      : 'rgba(0,0,0,0.10)',
                  }}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Client-side selection + bulk actions + table render */}
        <UrlsListClient
          urls={results || []}
          page={page}
          totalPages={totalPages}
          search={search}
          status={status}
        />
      </div>
    </div>
  );
}
