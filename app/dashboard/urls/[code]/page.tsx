import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { TIER_LIMITS, type UrlRecord } from '@/lib/types';
import ClicksChart, {
  type ChartPoint,
} from '@/app/components/ClicksChart';
import CopyButton from './CopyButton';
import DeleteButton from './DeleteButton';
import QrCard from './QrCard';
import { pruneUserClicks } from '@/lib/analytics-retention';

export const runtime = 'edge';

// Range chips shown in the chart toolbar.  Chips with `days` > the user's
// `maxClicksRetention` render disabled with a Pro lock indicator.
const RANGE_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

// Hard chart-range ceiling regardless of tier, per product spec.
const ABS_MAX_DAYS = 90;

const CARD_STYLE = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
  border: '1px solid rgba(0,0,0,0.10)',
  backdropFilter: 'blur(20px)',
} as const;

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

export default async function UrlDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const user = (await getCurrentUser())!;
  const { code } = await params;
  const db = getDB();
  const env = getEnv();
  const limits = TIER_LIMITS[user.tier];

  // Tier-aware range resolution. Default 7d. Cap at the user's retention
  // and at the global 90-day ceiling.
  const requested = Number.parseInt(daysParam || '7') || 7;
  const tierMax = Math.min(limits.maxClicksRetention, ABS_MAX_DAYS);
  const days = Math.max(1, Math.min(requested, tierMax));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  await pruneUserClicks(user.id, limits.maxClicksRetention);

  const url = await db
    .prepare('SELECT * FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id)
    .first<UrlRecord>();

  if (!url) {
    return (
      <div className="rounded-2xl p-8 text-center" style={CARD_STYLE}>
        <p className="text-white/45">URL not found</p>
      </div>
    );
  }

  // Always fetch the timeline + click meta — both are cheap aggregated
  // queries and they power the chart + export card for every tier.
  const [timelineRaw, exportMeta] = await Promise.all([
    db
      .prepare(
        `SELECT DATE(clicked_at) as date, COUNT(*) as count
         FROM clicks
         WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0
         GROUP BY DATE(clicked_at)
         ORDER BY date`,
      )
      .bind(url.id, since)
      .all<{ date: string; count: number }>(),
    db
      .prepare(
        'SELECT COUNT(*) as rows, MAX(clicked_at) as latest FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0',
      )
      .bind(url.id, since)
      .first<{ rows: number; latest: string | null }>(),
  ]);

  // Pro+ detail breakdowns
  let breakdowns: {
    countries: Array<{ country: string; count: number }>;
    browsers: Array<{ browser: string; count: number }>;
    devices: Array<{ device: string; count: number }>;
  } | null = null;
  if (limits.analytics) {
    const [countries, browsers, devices] = await Promise.all([
      db
        .prepare(
          'SELECT country, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY country ORDER BY count DESC LIMIT 10',
        )
        .bind(url.id, since)
        .all<{ country: string; count: number }>(),
      db
        .prepare(
          'SELECT browser, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY browser ORDER BY count DESC',
        )
        .bind(url.id, since)
        .all<{ browser: string; count: number }>(),
      db
        .prepare(
          'SELECT device, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY device ORDER BY count DESC',
        )
        .bind(url.id, since)
        .all<{ device: string; count: number }>(),
    ]);
    breakdowns = {
      countries: countries.results || [],
      browsers: browsers.results || [],
      devices: devices.results || [],
    };
  }

  const timeline = buildTimeline(timelineRaw.results || [], days);
  const shortUrl = `${env.BASE_URL}/${code}`;
  const rows = exportMeta?.rows || 0;
  const latest = exportMeta?.latest ? new Date(exportMeta.latest) : null;
  const sizeEstimate =
    rows < 1
      ? '< 1 KB'
      : `~${Math.max(1, Math.round((rows * 90) / 1024))} KB`;
  const isFree = user.tier === 'free';

  return (
    <div className="w-full max-w-6xl mx-auto py-2 px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            /{code}
          </h1>
          <p className="text-sm text-white/55 mt-1 max-w-lg truncate">
            {url.original_url}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <CopyButton value={shortUrl} />
          <DeleteButton code={code} />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Total clicks
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {url.clicks}
          </div>
        </div>
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Status
          </div>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-bold uppercase tracking-wider"
            style={
              url.is_active
                ? {
                    background: 'rgba(34,197,94,0.1)',
                    color: '#86efac',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }
                : {
                    background: 'rgba(239,68,68,0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.3)',
                  }
            }
          >
            {url.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[0.7rem] text-white/45 uppercase tracking-wider mb-2">
            Created
          </div>
          <div className="text-sm font-medium text-white">
            {new Date(url.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>

      {/* Main click chart */}
      <div className="p-6 rounded-2xl mb-6" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45 mb-0.5">
              Click activity
            </div>
            <div className="text-sm text-white/55">
              Last <span className="text-white font-semibold">{days}</span> day
              {days === 1 ? '' : 's'}
              {isFree && (
                <span className="ml-2 text-[#c62828]">
                  · Free preview
                </span>
              )}
            </div>
          </div>

          {/* Range chips */}
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => {
              const locked = opt.days > tierMax;
              const active = !locked && opt.days === days;
              const href = `?days=${opt.days}`;
              const cls =
                'inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium no-underline transition-colors';
              const style = active
                ? {
                    background: 'rgba(229,57,53,0.12)',
                    color: '#c62828',
                    border: '1px solid rgba(229,57,53,0.4)',
                  }
                : locked
                  ? {
                      background: 'rgba(0,0,0,0.03)',
                      color: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      cursor: 'not-allowed',
                    }
                  : {
                      background: 'transparent',
                      color: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(0,0,0,0.10)',
                    };
              if (locked) {
                return (
                  <span
                    key={opt.days}
                    className={cls}
                    style={style}
                    title="Pro tier required for this range"
                  >
                    {opt.label}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  </span>
                );
              }
              return (
                <Link
                  key={opt.days}
                  href={href}
                  className={cls}
                  style={style}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
        </div>

        <ClicksChart data={timeline} />

        {isFree && (
          <div
            className="mt-5 p-3 rounded-lg flex items-center justify-between gap-3 text-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(229,57,53,0.1) 0%, rgba(95,182,255,0.04) 100%)',
              border: '1px solid rgba(229,57,53,0.25)',
            }}
          >
            <span className="text-white/75">
              You&apos;re seeing a 3-day preview. Upgrade to unlock 7-day, 30-day, and 90-day windows.
            </span>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white no-underline whitespace-nowrap"
              style={{
                background:
                  'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                boxShadow: '0 4px 12px rgba(229,57,53,0.35)',
              }}
            >
              Upgrade
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Export click data (left) + QR (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-6">
        <div
          className="rounded-2xl p-6 relative overflow-hidden"
          style={CARD_STYLE}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45">
              Export click data
            </div>
            <span
              className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
              style={
                limits.analytics
                  ? {
                      background: 'rgba(229,57,53,0.12)',
                      color: '#c62828',
                      border: '1px solid rgba(229,57,53,0.3)',
                    }
                  : {
                      background: 'rgba(0,0,0,0.08)',
                      color: 'rgba(0,0,0,0.7)',
                      border: '1px solid rgba(0,0,0,0.15)',
                    }
              }
            >
              {limits.analytics ? 'Pro' : 'Preview'}
            </span>
          </div>

          {/* Sparkline preview — visible for ALL tiers (3-day teaser for free) */}
          <div
            className="rounded-xl p-3 mb-4"
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <ClicksChart data={timeline} height={110} compact />
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div
              className="px-3 py-2.5 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.98)',
                border: '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <div className="text-[0.62rem] uppercase tracking-wider text-white/40 mb-0.5">
                Rows
              </div>
              <div className="text-base font-bold text-white tabular-nums">
                {rows.toLocaleString()}
              </div>
            </div>
            <div
              className="px-3 py-2.5 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.98)',
                border: '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <div className="text-[0.62rem] uppercase tracking-wider text-white/40 mb-0.5">
                Size
              </div>
              <div className="text-base font-bold text-white tabular-nums">
                {sizeEstimate}
              </div>
            </div>
            <div
              className="px-3 py-2.5 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.98)',
                border: '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <div className="text-[0.62rem] uppercase tracking-wider text-white/40 mb-0.5">
                Latest
              </div>
              <div className="text-base font-bold text-white">
                {latest
                  ? latest.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </div>
            </div>
          </div>

          {/* CTA — download for paid, upgrade for free */}
          {limits.analytics ? (
            <a
              href={`/api/urls/${code}/clicks.csv`}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold no-underline transition-all ${
                rows > 0 ? 'text-white' : 'pointer-events-none'
              }`}
              style={
                rows > 0
                  ? {
                      background:
                        'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                      boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
                    }
                  : {
                      background: 'rgba(0,0,0,0.05)',
                      border: '1px solid rgba(0,0,0,0.10)',
                      color: 'rgba(0,0,0,0.4)',
                    }
              }
              aria-disabled={rows === 0}
              tabIndex={rows > 0 ? 0 : -1}
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
              {rows > 0
                ? `Download CSV (${rows.toLocaleString()} row${rows === 1 ? '' : 's'})`
                : 'No clicks yet'}
            </a>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/55 leading-relaxed">
                Per-click CSV exports — full window, all fields. Available
                from Pro.
              </div>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white no-underline whitespace-nowrap"
                style={{
                  background:
                    'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                  boxShadow: '0 4px 12px rgba(229,57,53,0.35)',
                }}
              >
                Unlock
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </Link>
            </div>
          )}
        </div>
        <QrCard
          shortUrl={shortUrl}
          presetLimit={limits.qrPresets}
          allowLogo={limits.qrLogo}
        />
      </div>

      {/* Country / Browser / Device breakdowns — Pro+ only */}
      {breakdowns ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Countries', rows: breakdowns.countries, key: 'country' as const },
            { title: 'Browsers', rows: breakdowns.browsers, key: 'browser' as const },
            { title: 'Devices', rows: breakdowns.devices, key: 'device' as const },
          ].map((panel) => (
            <div key={panel.title} className="p-5 rounded-2xl" style={CARD_STYLE}>
              <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45 mb-3">
                {panel.title}
              </div>
              {panel.rows.length > 0 ? (
                <div className="space-y-2">
                  {panel.rows.map((r) => {
                    const label = (r as any)[panel.key] || 'Unknown';
                    return (
                      <div
                        key={String(label)}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-white/70 truncate pr-2">
                          {label}
                        </span>
                        <span className="text-white font-medium tabular-nums">
                          {r.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-white/40 text-sm italic">No data</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="p-6 rounded-2xl text-center"
          style={{
            background:
              'linear-gradient(135deg, rgba(229,57,53,0.1) 0%, rgba(95,182,255,0.04) 100%)',
            border: '1px solid rgba(229,57,53,0.25)',
          }}
        >
          <p className="text-white/65 mb-3">
            Country, browser, and device breakdowns are available on Pro and
            above.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white no-underline"
            style={{
              background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
              boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
            }}
          >
            See plans
            <svg
              width="13"
              height="13"
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
    </div>
  );
}
