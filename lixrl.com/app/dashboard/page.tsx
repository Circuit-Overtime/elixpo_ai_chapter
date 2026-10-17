import Link from 'next/link';
import ClicksChart, {
  type ChartPoint,
} from '@/app/components/ClicksChart';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS, type UrlRecord } from '@/lib/types';
import {
  currentUtcQuotaWindow,
  FREE_DAILY_CREATION_LIMIT,
} from '@/lib/account-quota';
import { pruneUserClicks } from '@/lib/analytics-retention';

/** Fill missing days with zero so the chart has continuous bars. */
function buildTimeline(
  rows: Array<{ date: string; count: number }>,
  days: number,
): ChartPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r.count]));
  const out: ChartPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }
  return out;
}

export const runtime = 'edge';

const CARD_STYLE = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
  border: '1px solid rgba(0,0,0,0.10)',
  backdropFilter: 'blur(20px)',
} as const;

const DAYS_OPTIONS = [7, 30, 90] as const;

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.min(100, Math.round((num / denom) * 100));
}

function quotaTone(usagePct: number): {
  fill: string;
  label: string;
  tone: 'normal' | 'warn' | 'over';
} {
  if (usagePct >= 100)
    return {
      fill: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
      label: 'at limit',
      tone: 'over',
    };
  if (usagePct >= 80)
    return {
      fill: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
      label: 'nearly full',
      tone: 'warn',
    };
  return {
    fill: 'linear-gradient(90deg, #e53935 0%, #c62828 100%)',
    label: '',
    tone: 'normal',
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];
  const daysRaw = Number.parseInt(daysParam || '7');
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  await pruneUserClicks(user.id, limits.maxClicksRetention);

  const quotaWindow = currentUtcQuotaWindow();
  const [urlCount, totalClicks, recentClicks, timeline, topUrls, recentUrls, dailyQuota] =
    await Promise.all([
      db
        .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
        .bind(user.id)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.is_bot = 0',
        )
        .bind(user.id)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.clicked_at >= ? AND c.is_bot = 0',
        )
        .bind(user.id, since)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT DATE(c.clicked_at) as date, COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.clicked_at >= ? AND c.is_bot = 0 GROUP BY DATE(c.clicked_at) ORDER BY date',
        )
        .bind(user.id, since)
        .all<{ date: string; count: number }>(),
      db
        .prepare(
          'SELECT * FROM urls WHERE user_id = ? ORDER BY clicks DESC LIMIT 5',
        )
        .bind(user.id)
        .all<UrlRecord>(),
      db
        .prepare(
          'SELECT * FROM urls WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        )
        .bind(user.id)
        .all<UrlRecord>(),
      db
        .prepare(
          'SELECT created_count FROM user_creation_quotas WHERE user_id = ? AND window_start = ?',
        )
        .bind(user.id, quotaWindow.start)
        .first<{ created_count: number }>(),
    ]);

  const chartData = buildTimeline(timeline.results || [], days);
  const used = urlCount?.count || 0;
  const isUnlimited = limits.maxUrls === -1;
  const usagePct = isUnlimited ? 0 : pct(used, limits.maxUrls);
  const tone = quotaTone(usagePct);
  // Over cap = more links than the tier allows (e.g. after a downgrade).
  // Per policy, existing links keep resolving; only new creation is blocked.
  const isOverCap = !isUnlimited && used > limits.maxUrls;
  const showUpgradeNudge =
    user.tier === 'free' && !isUnlimited && (usagePct >= 80 || isOverCap);
  const freeDailyUsed = Math.min(
    dailyQuota?.created_count ?? 0,
    FREE_DAILY_CREATION_LIMIT,
  );

  return (
    <div className="w-full max-w-6xl mx-auto py-2 px-2">
      {/* Header — title + primary CTA */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-[1.8rem] font-bold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-white/55 mt-1">
            Overview of your links and click activity.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white no-underline transition-all"
          style={{
            background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
            boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Shorten URL
        </Link>
      </div>

      {user.tier === 'free' && (
        <div
          className="mb-6 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            background: 'rgba(229,57,53,0.08)',
            border: '1px dashed rgba(229,57,53,0.35)',
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                Free daily links: {freeDailyUsed}/{FREE_DAILY_CREATION_LIMIT} used
              </span>
            </div>
            <p className="text-xs text-white/55 mt-1">
              Resets at 00:00 UTC. Privacy-conscious request-risk signals help
              protect the shared free allowance.
            </p>
          </div>
          <Link
            href="/pricing"
            className="text-xs font-semibold text-[#e53935] no-underline hover:underline shrink-0"
          >
            Compare plans →
          </Link>
        </div>
      )}

      {/* Tier upgrade nudge — only when free + ≥80% of quota */}
      {showUpgradeNudge && (
        <div
          className="mb-6 p-4 md:p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(229,57,53,0.14) 0%, rgba(95,182,255,0.06) 100%)',
            border: '1px solid rgba(229,57,53,0.3)',
          }}
        >
          <div>
            <div className="text-sm font-bold text-white">
              {isOverCap
                ? `You have ${used} links — Free includes ${limits.maxUrls}`
                : `You're at ${used} of ${limits.maxUrls} links on Free`}
            </div>
            <p className="text-sm text-white/65 mt-0.5">
              {isOverCap
                ? 'All your links still work. Resubscribe to create new ones and restore custom slugs, longer analytics, and styled QR.'
                : usagePct >= 100
                  ? "You've hit the limit. Upgrade to keep shortening."
                  : 'Upgrade to Pro for higher limits, custom slugs, and longer analytics retention.'}
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white no-underline whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
              boxShadow: '0 4px 14px rgba(229,57,53,0.4)',
            }}
          >
            View pricing
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
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* My URLs + progress */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            My URLs
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-white">{used}</span>
            <span className="text-sm text-white/45 font-normal">
              / {isUnlimited ? '∞' : limits.maxUrls}
            </span>
          </div>
          {!isUnlimited && (
            <div className="mt-3">
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(0,0,0,0.08)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(usagePct, 2)}%`,
                    background: tone.fill,
                  }}
                />
              </div>
              {tone.label && (
                <div
                  className="text-[0.7rem] mt-1.5 font-medium"
                  style={{
                    color: tone.tone === 'over' ? '#f87171' : '#fde7a4',
                  }}
                >
                  {usagePct}% · {tone.label}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Total clicks */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Total clicks
          </div>
          <div className="text-2xl font-bold text-white">
            {totalClicks?.count || 0}
          </div>
          <div className="text-[0.7rem] text-white/45 mt-1.5">All time</div>
        </div>

        {/* Recent clicks */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Clicks · {days}d
          </div>
          <div className="text-2xl font-bold text-white">
            {recentClicks?.count || 0}
          </div>
          <div className="text-[0.7rem] text-white/45 mt-1.5">
            Last {days} days
          </div>
        </div>

        {/* Plan */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Plan
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.75rem] font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(229,57,53,0.18)',
                color: '#c62828',
                border: '1px solid rgba(229,57,53,0.4)',
              }}
            >
              {user.tier}
            </span>
          </div>
          {user.tier === 'free' && (
            <Link
              href="/pricing"
              className="text-[0.7rem] text-[#e53935] hover:underline mt-1.5 inline-block no-underline"
            >
              Upgrade →
            </Link>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6 rounded-2xl mb-6" style={CARD_STYLE}>
        <div className="flex justify-between items-center mb-4">
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45">
            Click timeline
          </div>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map((d) => (
              <Link
                key={d}
                href={`/dashboard?days=${d}`}
                className="text-xs px-2.5 py-1 rounded-lg no-underline transition-all font-medium"
                style={{
                  background:
                    days === d ? 'rgba(229,57,53,0.12)' : 'transparent',
                  color: days === d ? '#c62828' : 'rgba(0,0,0,0.55)',
                }}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
        <ClicksChart data={chartData} />
      </div>

      {/* Two-column: Top URLs + Recently created */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top URLs by clicks */}
        <div className="p-6 rounded-2xl" style={CARD_STYLE}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45">
              Top URLs
            </div>
            <Link
              href="/dashboard/urls"
              className="text-xs text-white/55 hover:text-white no-underline transition-colors"
            >
              View all →
            </Link>
          </div>
          {topUrls.results && topUrls.results.length > 0 ? (
            <ul className="space-y-2 list-none p-0">
              {topUrls.results.map((u) => (
                <li
                  key={u.short_code}
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'rgba(0,0,0,0.03)' }}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/urls/${u.short_code}`}
                      className="text-[#c62828] text-sm font-mono font-semibold no-underline hover:underline"
                    >
                      /{u.short_code}
                    </Link>
                    <div className="text-xs text-white/45 truncate mt-0.5">
                      {u.original_url}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-white">
                      {u.clicks}
                    </div>
                    <div className="text-[0.65rem] text-white/40 uppercase tracking-wider">
                      clicks
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyUrls />
          )}
        </div>

        {/* Recently created URLs */}
        <div className="p-6 rounded-2xl" style={CARD_STYLE}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45">
              Recently created
            </div>
            <Link
              href="/dashboard/urls"
              className="text-xs text-white/55 hover:text-white no-underline transition-colors"
            >
              View all →
            </Link>
          </div>
          {recentUrls.results && recentUrls.results.length > 0 ? (
            <ul className="space-y-2 list-none p-0">
              {recentUrls.results.map((u) => (
                <li
                  key={u.short_code}
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'rgba(0,0,0,0.03)' }}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/urls/${u.short_code}`}
                      className="text-[#c62828] text-sm font-mono font-semibold no-underline hover:underline"
                    >
                      /{u.short_code}
                    </Link>
                    <div className="text-xs text-white/45 truncate mt-0.5">
                      {u.original_url}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-white/55">
                      {new Date(u.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyUrls />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyUrls() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-white/55 mb-3">No URLs yet.</p>
      <Link
        href="/dashboard/new"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white no-underline"
        style={{
          background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
          boxShadow: '0 4px 12px rgba(229,57,53,0.3)',
        }}
      >
        Shorten your first URL
      </Link>
    </div>
  );
}
