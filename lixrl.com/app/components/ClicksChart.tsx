'use client';

import { useMemo, useState } from 'react';

export interface ChartPoint {
  date: string;       // YYYY-MM-DD
  count: number;
}

interface Props {
  data: ChartPoint[]; // sequential, may include zero-count days
  height?: number;    // SVG viewBox height (default 200)
  /** Hide x-axis date labels (used by the sparkline variant) */
  compact?: boolean;
}

const PAD_L = 40;   // left padding for y-axis labels
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 28;   // bottom padding for x-axis labels
const ACCENT = '#e53935';
const ACCENT_DEEP = '#c62828';

/**
 * Time-series click chart. SVG, no library deps, hover tooltip via
 * React state. Pure presentational — caller decides the date range
 * and supplies a continuous (no-gap) array of points.
 */
export default function ClicksChart({ data, height = 200, compact = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  // Compute viewBox width based on data length so wide ranges still
  // render legibly without bars getting too thin.
  const w = useMemo(() => {
    const min = 600;
    return Math.max(min, data.length * 14);
  }, [data.length]);

  const plotW = w - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const maxC = Math.max(1, ...data.map((p) => p.count));

  // Y-axis ticks — round to a clean number above max
  const yTicks = useMemo(() => buildYTicks(maxC), [maxC]);
  const yScale = (n: number) => PAD_T + plotH - (n / yTicks[yTicks.length - 1]) * plotH;

  // Each bar gets equal width across the plot area.
  const slotW = plotW / Math.max(1, data.length);
  const barW = Math.min(48, Math.max(3, slotW - 4));
  const barOffset = (slotW - barW) / 2;

  // X-axis labels: show at most ~6 evenly spaced labels regardless of
  // how many points we have. Avoids the overlapping-date-label problem.
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative w-full" style={{ minHeight: height }}>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height, display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`Click activity, ${data.length} days`}
      >
        <defs>
          <linearGradient id="cc-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.95" />
            <stop offset="100%" stopColor={ACCENT_DEEP} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {!compact &&
          yTicks.map((tick, i) => {
            const y = yScale(tick);
            return (
              <g key={tick}>
                <line
                  x1={PAD_L}
                  x2={w - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="rgba(0,0,0,0.08)"
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? '0' : '3 3'}
                />
                <text
                  x={PAD_L - 6}
                  y={y + 3}
                  fill="rgba(0,0,0,0.45)"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {tick}
                </text>
              </g>
            );
          })}

        {/* Bars */}
        {data.map((p, i) => {
          const x = PAD_L + i * slotW + barOffset;
          const yTop = yScale(p.count);
          const h = Math.max(0, PAD_T + plotH - yTop);
          const isHovered = hover === i;
          return (
            <g
              key={p.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'default' }}
            >
              {/* Hover hit area — full slot height for easy targeting */}
              <rect
                x={PAD_L + i * slotW}
                y={PAD_T}
                width={slotW}
                height={plotH}
                fill="transparent"
              />
              <rect
                x={x}
                y={p.count === 0 ? PAD_T + plotH - 2 : yTop}
                width={barW}
                height={p.count === 0 ? 2 : h}
                rx={2}
                fill={p.count === 0 ? 'rgba(0,0,0,0.08)' : 'url(#cc-bar)'}
                style={{
                  transition: 'filter 0.15s ease',
                  filter: isHovered ? 'brightness(1.25)' : 'none',
                }}
              />
            </g>
          );
        })}

        {/* X-axis date labels */}
        {!compact &&
          data.map((p, i) =>
            i % xLabelEvery === 0 || i === data.length - 1 ? (
              <text
                key={`xl-${p.date}`}
                x={PAD_L + i * slotW + slotW / 2}
                y={height - 10}
                fill="rgba(0,0,0,0.45)"
                fontSize="10"
                textAnchor="middle"
                fontFamily="var(--font-geist-mono), monospace"
              >
                {formatShort(p.date)}
              </text>
            ) : null,
          )}
      </svg>

      {/* Hover tooltip */}
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: `calc(${((PAD_L + hover * slotW + slotW / 2) / w) * 100}% - 50px)`,
            top: 0,
            width: 100,
            transition: 'left 0.05s ease',
          }}
        >
          <div
            className="rounded-md px-2 py-1 text-center"
            style={{
              background: 'rgba(255,255,255,0.98)',
              border: '1px solid rgba(229,57,53,0.3)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            }}
          >
            <div className="text-[0.6rem] uppercase tracking-wider text-[#777]">
              {formatLong(data[hover].date)}
            </div>
            <div className="text-[0.95rem] font-bold text-[#111] tabular-nums">
              {data[hover].count}{' '}
              <span className="text-[0.65rem] font-medium text-[#666]">
                click{data[hover].count === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function buildYTicks(max: number): number[] {
  // Find a clean upper bound that's >= max and produces 4 ticks ending
  // at it. Snaps to powers of 10 / 2.5 / 5 for readability.
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  let step = 1;
  for (const s of niceSteps) {
    if (s * 4 >= max) {
      step = s;
      break;
    }
  }
  if (step * 4 < max) {
    // Scale up for very large counts
    const magnitude = 10 ** Math.floor(Math.log10(max));
    step = Math.ceil(max / 4 / magnitude) * magnitude;
  }
  return [0, step, step * 2, step * 3, step * 4];
}

function formatShort(iso: string): string {
  // YYYY-MM-DD → "Jun 13"
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
