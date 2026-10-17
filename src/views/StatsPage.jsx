'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';

const TABS = ['Overview', 'Posts', 'Audience', 'Acquisition'];
const RANGES = [
  ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months'], ['custom', 'Custom'],
];

const DEFAULT_ANALYTICS_PALETTE = {
  primary: '#9b7bf7', blue: '#60a5fa', green: '#4ade80', orange: '#f59e0b',
  cyan: '#22d3ee', sky: '#38bdf8', rose: '#f472b6', violet: '#a78bfa',
  categories: ['#9b7bf7', '#60a5fa', '#f472b6', '#4ade80', '#f59e0b'],
};

const fmt = (value) => new Intl.NumberFormat('en', { notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0);

function Delta({ value }) {
  const number = Number(value) || 0;
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color: number > 0 ? '#22c55e' : number < 0 ? '#f87171' : 'var(--text-faint)' }}>
      {number > 0 ? '↑' : number < 0 ? '↓' : '—'} {Math.abs(number)}% vs previous
    </span>
  );
}

function ComparisonBars({ current, previous, accent }) {
  const currentValue = Math.max(0, Number(current) || 0);
  const previousValue = Math.max(0, Number(previous) || 0);
  const max = Math.max(currentValue, previousValue, 1);
  return <div className="mt-auto pt-4 space-y-2" aria-label={`Current ${currentValue}, previous ${previousValue}`}>
    {[['Current', currentValue, accent], ['Previous', previousValue, 'var(--text-faint)']].map(([label, value, color]) => <div key={label} className="grid grid-cols-[54px_1fr_36px] items-center gap-2 text-[9px] tabular-nums" style={{ color: 'var(--text-faint)' }}><span>{label}</span><span className="block h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><span className="block h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} /></span><span className="text-right">{fmt(value)}</span></div>)}
  </div>;
}

function MiniTrend({ values = [], accent }) {
  const width = 420;
  const height = 132;
  const pad = 8;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const spread = Math.max(max - min, 1);
  const points = values.map((value, index) => `${pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1)},${height - pad - ((Number(value) - min) / spread) * (height - pad * 2)}`).join(' ');
  const area = points ? `${pad},${height - pad} ${points} ${width - pad},${height - pad}` : '';
  return <div className="mt-5 rounded-xl border px-2 pt-2" style={{ borderColor: `${accent}22`, background: `${accent}08` }}><svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 sm:h-32" aria-label="Views trend">
    {[.25, .5, .75].map(fraction => <line key={fraction} x1={pad} x2={width - pad} y1={height * fraction} y2={height * fraction} stroke="var(--border-default)" strokeWidth="1" />)}
    {area && <polygon points={area} fill={accent} opacity=".12" />}
    <polyline points={points} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
  </svg></div>;
}

function MetricCard({ label, value, previous, change, suffix = '', definition, accent = '#9b7bf7', featured = false, trend = [] }) {
  return (
    <article className={`${featured ? 'col-span-2 row-span-2 p-6 sm:p-7' : 'p-5'} relative overflow-hidden rounded-[22px] border min-w-0 h-full flex flex-col`} style={{ background: `linear-gradient(145deg, ${accent}12 0%, var(--bg-surface) 48%)`, borderColor: `${accent}35` }} title={definition}>
      <span className="absolute -right-10 -top-10 w-28 h-28 rounded-full blur-3xl opacity-20" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-[.12em] font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="w-2 h-2 rounded-full" style={{ background: accent, boxShadow: `0 0 12px ${accent}66` }} />
      </div>
      <p className={`${featured ? 'text-4xl sm:text-5xl' : 'text-[26px]'} leading-none font-bold mb-2 tabular-nums`} style={{ color: 'var(--text-primary)' }}>{fmt(value)}{suffix}</p>
      <Delta value={change} />
      {featured && <MiniTrend values={trend} accent={accent} />}
      {previous !== undefined && <ComparisonBars current={value} previous={previous} accent={accent} />}
    </article>
  );
}

function RatioCard({ label, value, previous, change, accent, definition }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return <article className="col-span-2 rounded-[22px] border p-5 sm:p-6 flex items-center justify-between gap-5 overflow-hidden" style={{ background: `linear-gradient(120deg, ${accent}12, var(--bg-surface))`, borderColor: `${accent}35` }} title={definition}>
    <div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-[.12em] font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="text-3xl font-bold mb-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(value)}%</p><Delta value={change} />{previous !== undefined && <ComparisonBars current={value} previous={previous} accent={accent} />}</div>
    <div className="relative w-20 h-20 shrink-0 rounded-full grid place-items-center" style={{ background: `conic-gradient(${accent} ${safeValue * 3.6}deg, var(--bg-elevated) 0)` }}><div className="w-14 h-14 rounded-full grid place-items-center text-[11px] font-semibold" style={{ background: 'var(--bg-surface)', color: accent }}>{Math.round(safeValue)}%</div></div>
  </article>;
}

function TrendChart({ labels = [], values = [], color = '#9b7bf7', chartRef }) {
  const width = 900;
  const height = 260;
  const pad = 42;
  const max = Math.max(...values, 1);
  const average = values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
  const averageY = height - pad - (average / max) * (height - pad * 2);
  const points = values.map((value, index) => ({
    x: pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1),
    y: height - pad - (Number(value) / max) * (height - pad * 2),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = points.length ? `${line} L ${points.at(-1).x} ${height - pad} L ${points[0].x} ${height - pad} Z` : '';
  const labelIndexes = labels.map((_, index) => index).filter(index => index === 0 || index === labels.length - 1 || index % Math.ceil(labels.length / 6) === 0);

  return (
    <div className="overflow-x-auto">
      <svg ref={chartRef} viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[620px]" role="img" aria-label="Analytics trend chart">
        {[0, .25, .5, .75, 1].map(fraction => {
          const y = height - pad - fraction * (height - pad * 2);
          return <g key={fraction}><line x1={pad} y1={y} x2={width - pad} y2={y} stroke="var(--border-default)" /><text x={pad - 8} y={y + 4} textAnchor="end" fill="var(--text-faint)" fontSize="10">{fmt(max * fraction)}</text></g>;
        })}
        {area && <path d={area} fill={color} opacity=".1" />}
        <line x1={pad} y1={averageY} x2={width - pad} y2={averageY} stroke={color} strokeWidth="1" strokeDasharray="5 5" opacity=".5" />
        <text x={width - pad} y={Math.max(12, averageY - 7)} textAnchor="end" fill={color} fontSize="10">avg {fmt(average)}</text>
        {line && <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point, index) => <circle key={labels[index]} cx={point.x} cy={point.y} r="3" fill={color}><title>{labels[index]}: {values[index]}</title></circle>)}
        {labelIndexes.map(index => <text key={labels[index]} x={points[index]?.x || pad} y={height - 12} textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'} fill="var(--text-faint)" fontSize="10">{new Date(`${labels[index]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>)}
      </svg>
    </div>
  );
}

function Breakdown({ title, rows = [], empty = 'No data yet', accent = '#9b7bf7' }) {
  const max = Math.max(...rows.map(row => Number(row.value)), 1);
  return (
    <section className="rounded-2xl border p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
      <h2 className="text-[14px] font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {rows.length ? <div className="space-y-4">{rows.map(row => (
        <div key={row.label || 'Unknown'}>
          <div className="flex justify-between text-[12px] mb-1.5"><span style={{ color: 'var(--text-body)' }}>{row.label || 'Unknown'}</span><span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(row.value)}</span></div>
          <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(3, (Number(row.value) / max) * 100)}%`, background: accent }} /></div>
        </div>
      ))}</div> : <p className="text-[13px] py-10 text-center" style={{ color: 'var(--text-faint)' }}>{empty}</p>}
    </section>
  );
}

function DonutBreakdown({ title, rows = [], colors = DEFAULT_ANALYTICS_PALETTE.categories }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += total ? (Number(row.value || 0) / total) * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(', ');
  return <section className="rounded-[22px] border p-5 sm:p-6 min-h-[390px] flex flex-col" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <div className="flex items-start justify-between"><div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2><p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>Share of audience actions</p></div><span className="rounded-full px-2.5 py-1 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>{fmt(total)} total</span></div>
    <div className="flex-1 grid sm:grid-cols-[190px_1fr] items-center justify-center gap-8 py-7 max-w-[510px] w-full mx-auto">
      <div className="relative w-[176px] h-[176px] mx-auto rounded-full grid place-items-center shrink-0" style={{ background: total ? `conic-gradient(${stops})` : 'var(--bg-elevated)', boxShadow: 'inset 0 0 0 1px var(--border-default), 0 14px 35px rgba(21,16,32,.08)' }}>
        <div className="w-[112px] h-[112px] rounded-full grid place-items-center text-center" style={{ background: 'var(--bg-surface)', boxShadow: '0 0 0 1px var(--border-default)' }}><div><p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(total)}</p><p className="text-[9px] uppercase tracking-[.16em] mt-1" style={{ color: 'var(--text-faint)' }}>actions</p></div></div>
      </div>
      <div className="w-full space-y-3">{rows.map((row, index) => {
        const share = total ? Math.round((Number(row.value || 0) / total) * 100) : 0;
        return <div key={row.label}><div className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11px]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[index % colors.length], boxShadow: `0 0 8px ${colors[index % colors.length]}55` }} /><span style={{ color: 'var(--text-body)' }}>{row.label}</span><span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(row.value)} <span className="font-normal" style={{ color: 'var(--text-faint)' }}>· {share}%</span></span></div><div className="ml-[18px] mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}><div className="h-full rounded-full" style={{ width: `${share}%`, background: colors[index % colors.length] }} /></div></div>;
      })}</div>
    </div>
  </section>;
}

function FunnelGraph({ rows = [], colors = DEFAULT_ANALYTICS_PALETTE.categories }) {
  const max = Math.max(...rows.map(row => Number(row.value || 0)), 1);
  return <section className="rounded-[22px] border p-5 sm:p-6 min-h-[390px] flex flex-col" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
    <div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Conversion funnel</h2><p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>From discovery to retained audience</p></div>
    <div className="flex-1 flex flex-col justify-center py-5 max-w-[520px] w-full mx-auto">{rows.map((row, index) => {
      const value = Number(row.value || 0);
      const width = Math.max(32, (value / max) * 100);
      const previous = index ? Number(rows[index - 1].value || 0) : 0;
      const ratio = previous ? value / previous : 1;
      const comparison = ratio > 1 ? `${ratio.toFixed(1)}× stage volume` : `${Math.round(ratio * 100)}% retained`;
      return <div key={row.label} className="text-center">
        {index > 0 && <div className="h-7 flex items-center justify-center gap-2 text-[9px] tabular-nums" style={{ color: ratio > 1 ? colors[1] : 'var(--text-faint)' }}><span className="h-4 w-px" style={{ background: 'var(--border-default)' }} /><span>{ratio > 1 ? '↑' : '↓'} {comparison}</span></div>}
        <div className="mx-auto min-w-[170px] h-11 px-4 flex items-center justify-between gap-3 transition-all" style={{ width: `${width}%`, clipPath: 'polygon(3% 0, 97% 0, 100% 50%, 97% 100%, 3% 100%, 0 50%)', background: `linear-gradient(90deg, color-mix(in srgb, ${colors[index % colors.length]} ${Math.max(22, 46 - index * 5)}%, transparent), color-mix(in srgb, ${colors[(index + 1) % colors.length]} ${Math.max(16, 34 - index * 4)}%, transparent))`, color: 'var(--text-primary)' }}><span className="text-[11px] font-medium truncate">{row.label}</span><span className="text-[12px] font-bold tabular-nums">{fmt(value)}</span></div>
      </div>;
    })}</div>
  </section>;
}

function ContentInventory({ published, drafts, accent = '#9b7bf7' }) {
  const total = Number(published || 0) + Number(drafts || 0);
  const publishedShare = total ? (Number(published) / total) * 100 : 0;
  return <article className="col-span-2 rounded-[22px] border p-5 sm:p-6 flex flex-col justify-between" style={{ background: `linear-gradient(130deg, color-mix(in srgb, ${accent} 9%, transparent), var(--bg-surface))`, borderColor: 'var(--border-default)' }}><div><p className="text-[11px] uppercase tracking-[.12em] font-semibold" style={{ color: 'var(--text-muted)' }}>Content inventory</p><p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>Publishing balance across your workspace</p></div><div className="grid grid-cols-2 gap-5 my-5"><div><p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(published)}</p><p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Published</p></div><div><p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(drafts)}</p><p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Drafts</p></div></div><div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-elevated)' }}><span style={{ width: `${publishedShare}%`, background: accent }} /><span className="flex-1 bg-[#94a3b8]/30" /></div></article>;
}

function CollectingNotice({ accent = '#9b7bf7' }) {
  return (
    <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 24%, var(--border-default))` }}>
      <ion-icon name="hourglass-outline" style={{ color: accent, fontSize: '18px', marginTop: 1 }} />
      <div><p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Dimensional analytics are collecting</p><p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Historical totals remain available. Audience, device, country, source, completion, and share insights fill in from this deployment onward.</p></div>
    </div>
  );
}

export default function StatsPage() {
  const { user, loading } = useAuth();
  const palette = DEFAULT_ANALYTICS_PALETTE;
  const [tab, setTab] = useState('Overview');
  const [range, setRange] = useState('30d');
  const [scope, setScope] = useState('personal');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('views');
  const [postQuery, setPostQuery] = useState('');
  const [postSort, setPostSort] = useState('views');
  const [exportingPNG, setExportingPNG] = useState(false);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/orgs').then(response => response.ok ? response.json() : null).then(result => setOrgs(result?.orgs || [])).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || (range === 'custom' && (!customFrom || !customTo))) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ range, scope });
    if (range === 'custom') { params.set('from', customFrom); params.set('to', customTo); }
    setFetching(true);
    setError('');
    fetch(`/api/stats/overview?${params}`, { signal: controller.signal })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load analytics');
        return result;
      })
      .then(setData)
      .catch(fetchError => { if (fetchError.name !== 'AbortError') setError(fetchError.message); })
      .finally(() => setFetching(false));
    return () => controller.abort();
  }, [user, range, scope, customFrom, customTo]);

  const posts = useMemo(() => (data?.posts || [])
    .filter(post => post.title.toLowerCase().includes(postQuery.toLowerCase()))
    .sort((a, b) => Number(b[postSort]) - Number(a[postSort])), [data, postQuery, postSort]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Metric', 'Current', 'Previous', 'Change %'],
      ...Object.keys(data.totals).map(key => [key, data.totals[key], data.previous[key] ?? '', data.changes[key] ?? '']),
      [], ['Post', 'Views', 'Unique visitors', 'Reads', 'Average progress %', 'Engagement rate %'],
      ...posts.map(post => [post.title, post.views, post.uniqueVisitors, post.reads, post.avgReadProgress, post.engagementRate]),
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `lixblogs-analytics-${range}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportPNG = () => {
    const svg = chartRef.current;
    if (!svg) return;
    setExportingPNG(true);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1120;
      const context = canvas.getContext('2d');
      const roundRect = (x, y, width, height, radius, fill, stroke = '#e8e5ef') => { context.beginPath(); context.roundRect(x, y, width, height, radius); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); };
      context.fillStyle = '#faf9fc'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = palette.primary; context.font = '600 22px sans-serif'; context.fillText('LIXBLOGS · CREATOR ANALYTICS', 80, 82);
      context.fillStyle = '#17131f'; context.font = '700 58px Georgia, serif'; context.fillText('Performance snapshot', 80, 150);
      context.fillStyle = '#746d80'; context.font = '24px Georgia, serif'; context.fillText(`${data?.scope?.label || 'Personal'} · ${RANGES.find(item => item[0] === range)?.[1] || range}`, 80, 194);
      const cards = [
        ['Views', totals.views, data?.changes?.views, palette.primary],
        ['Unique visitors', totals.uniqueVisitors, data?.changes?.uniqueVisitors, palette.orange],
        ['Reads', totals.reads, data?.changes?.reads, palette.green],
        ['Engagement', `${fmt(totals.engagementRate)}%`, data?.changes?.engagementRate, palette.blue],
      ];
      cards.forEach(([label, value, change, color], index) => {
        const x = 80 + index * 415;
        roundRect(x, 245, 375, 190, 24, '#ffffff');
        context.fillStyle = color; context.beginPath(); context.arc(x + 330, 285, 7, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#746d80'; context.font = '600 18px sans-serif'; context.fillText(label.toUpperCase(), x + 28, 292);
        context.fillStyle = '#17131f'; context.font = '700 48px Georgia, serif'; context.fillText(String(value), x + 28, 360);
        context.fillStyle = Number(change) > 0 ? '#16a34a' : Number(change) < 0 ? '#ef4444' : '#8b8492'; context.font = '600 17px sans-serif'; context.fillText(`${Number(change) > 0 ? '↑' : Number(change) < 0 ? '↓' : '—'} ${Math.abs(Number(change) || 0)}% vs previous`, x + 28, 402);
      });
      roundRect(80, 480, 1640, 540, 28, '#ffffff');
      context.fillStyle = '#17131f'; context.font = '700 27px Georgia, serif'; context.fillText(`${metric === 'views' ? 'Views' : 'Reads'} over time`, 120, 540);
      context.fillStyle = '#8b8492'; context.font = '18px sans-serif'; context.fillText('Daily totals in the selected period', 120, 574);
      context.drawImage(image, 120, 600, 1560, 380);
      context.fillStyle = '#9a93a2'; context.font = '16px sans-serif'; context.fillText(`Exported ${new Date().toLocaleDateString()} · blogs.elixpo.com`, 80, 1080);
      const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `lixblogs-analytics-${range}.png`; link.click();
      URL.revokeObjectURL(image.src);
      setExportingPNG(false);
    };
    image.onerror = () => setExportingPNG(false);
    const exportSvg = svg.cloneNode(true);
    exportSvg.querySelectorAll('[stroke="var(--border-default)"]').forEach(node => node.setAttribute('stroke', '#ece9f1'));
    exportSvg.querySelectorAll('[fill="var(--text-faint)"]').forEach(node => node.setAttribute('fill', '#8b8492'));
    image.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(exportSvg)], { type: 'image/svg+xml' }));
  };

  if (loading || !user) return <AppShell><div className="max-w-6xl mx-auto px-5 py-10"><div className="h-10 w-40 rounded-lg animate-pulse bg-[var(--bg-elevated)]" /></div></AppShell>;

  const totals = data?.totals || {};
  const definitions = data?.definitions || {};

  return (
    <AppShell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
          <div><p className="text-[11px] uppercase tracking-[.18em] font-semibold mb-2" style={{ color: palette.primary }}>Creator dashboard</p><h1 className="text-3xl sm:text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1><p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>Understand reach, reading quality, audience, and growth.</p></div>
          <div className="flex flex-wrap gap-2">
            <select value={scope} onChange={event => setScope(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }} aria-label="Analytics scope"><option value="personal">Personal</option>{orgs.map(org => <option key={org.id} value={`org:${org.id}`}>{org.name}</option>)}</select>
            <button onClick={exportCSV} disabled={!data} className="rounded-lg px-3 py-2 text-[12px] border disabled:opacity-40" style={{ borderColor: 'var(--border-default)', color: 'var(--text-body)', background: 'var(--bg-surface)' }}><ion-icon name="download-outline" /> CSV</button>
            <button onClick={exportPNG} disabled={!data || exportingPNG} className="rounded-lg px-3 py-2 text-[12px] border disabled:opacity-40 inline-flex items-center gap-1.5" style={{ borderColor: 'var(--border-default)', color: 'var(--text-body)', background: 'var(--bg-surface)' }}><ion-icon name={exportingPNG ? 'hourglass-outline' : 'image-outline'} /> {exportingPNG ? 'Exporting…' : 'PNG report'}</button>
          </div>
        </header>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <nav className="flex overflow-x-auto" aria-label="Analytics sections">{TABS.map(item => <button key={item} onClick={() => setTab(item)} className="px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2" style={{ color: tab === item ? palette.primary : 'var(--text-muted)', borderColor: tab === item ? palette.primary : 'transparent' }}>{item}</button>)}</nav>
          <div className="flex items-center gap-1.5 pb-3 md:pb-0 overflow-x-auto">{RANGES.map(([value, label]) => <button key={value} onClick={() => setRange(value)} className="px-2.5 py-1.5 rounded-md text-[11px] whitespace-nowrap" style={{ background: range === value ? `color-mix(in srgb, ${palette.green} 12%, transparent)` : 'transparent', color: range === value ? palette.green : 'var(--text-faint)' }}>{label}</button>)}</div>
        </div>

        {range === 'custom' && <div className="flex flex-wrap gap-3 mb-5"><label className="text-[12px]" style={{ color: 'var(--text-muted)' }}>From <input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} className="ml-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }} /></label><label className="text-[12px]" style={{ color: 'var(--text-muted)' }}>To <input type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} className="ml-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }} /></label></div>}

        {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 text-red-300 px-4 py-3 text-[13px] mb-5 flex justify-between"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
        {data?.dimensionsCollecting && <div className="mb-5"><CollectingNotice accent={palette.orange} /></div>}
        {data && <div className="fixed -left-[10000px] top-0 w-[900px] pointer-events-none" aria-hidden="true"><TrendChart chartRef={chartRef} labels={data.trend.labels} values={data.trend[metric]} color={metric === 'views' ? palette.primary : palette.green} /></div>}

        {fetching ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 rounded-2xl animate-pulse bg-[var(--bg-elevated)]" />)}</div> : data && <>
          {tab === 'Overview' && <div className="space-y-6">
            <div className="grid grid-cols-4 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>{[['Reach', 'Views & visitors'], ['Read', 'Depth & time'], ['Engage', 'Actions & completion'], ['Retain', 'Follower growth']].map(([step, detail], index) => <div key={step} className="relative px-3 py-2.5 border-r last:border-r-0" style={{ borderColor: 'var(--border-default)' }}><p className="text-[9px] uppercase tracking-[.14em] font-bold" style={{ color: palette.categories[index % palette.categories.length] }}>0{index + 1} · {step}</p><p className="hidden sm:block text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>{detail}</p></div>)}</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-fr items-stretch gap-3 sm:gap-4">
              <MetricCard featured trend={data.trend.views} label="Views" value={totals.views} previous={data.previous.views} change={data.changes.views} definition={definitions.views} accent={palette.primary} />
              <MetricCard label="Unique visitors" value={totals.uniqueVisitors} previous={data.previous.uniqueVisitors} change={data.changes.uniqueVisitors} definition={definitions.uniqueVisitors} accent={palette.orange} />
              <MetricCard label="Reads" value={totals.reads} previous={data.previous.reads} change={data.changes.reads} definition={definitions.reads} accent={palette.green} />
              <RatioCard label="Completion" value={totals.completionRate} previous={data.previous.completionRate} change={data.changes.completionRate} definition={definitions.completionRate} accent={palette.orange} />
              <MetricCard label="Avg. reading depth" value={totals.avgReadProgress} previous={data.previous.avgReadProgress} suffix="%" change={data.changes.avgReadProgress} definition={definitions.avgReadProgress} accent={palette.cyan} />
              <MetricCard label="Avg. read time" value={totals.avgReadTime} previous={data.previous.avgReadTime} suffix="s" change={data.changes.avgReadTime} definition={definitions.avgReadTime} accent={palette.sky} />
              <RatioCard label="Engagement rate" value={totals.engagementRate} previous={data.previous.engagementRate} change={data.changes.engagementRate} definition={definitions.engagementRate} accent={palette.rose} />
              <MetricCard label="Followers gained" value={totals.followers} previous={data.previous.followers} change={data.changes.followers} definition={definitions.followers} accent={palette.violet} />
              <MetricCard label="Followers lost" value={totals.followersLost} previous={data.previous.followersLost} change={data.changes.followersLost} accent="#f87171" />
              <ContentInventory published={totals.published} drafts={totals.drafts} accent={palette.green} />
            </div>
            <section className="rounded-2xl border p-4 sm:p-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <div className="flex items-center justify-between mb-4"><div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Performance over time</h2><p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>Daily totals in the selected period</p></div><select value={metric} onChange={event => setMetric(event.target.value)} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}><option value="views">Views</option><option value="reads">Reads</option></select></div>
              <TrendChart labels={data.trend.labels} values={data.trend[metric]} color={metric === 'views' ? palette.primary : palette.green} />
            </section>
            <div className="grid md:grid-cols-2 gap-4 items-stretch"><DonutBreakdown title="Engagement mix" colors={palette.categories} rows={[['Likes', totals.likes], ['Comments', totals.comments], ['Bookmarks', totals.bookmarks], ['Shares', totals.shares], ['Claps', totals.claps]].map(([label, value]) => ({ label, value }))} /><FunnelGraph rows={data.funnel} colors={palette.categories} /></div>
          </div>}

          {tab === 'Posts' && <section className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="p-4 border-b flex flex-wrap gap-3 justify-between" style={{ borderColor: 'var(--border-default)' }}><input value={postQuery} onChange={event => setPostQuery(event.target.value)} placeholder="Search posts" className="rounded-lg px-3 py-2 text-[12px] min-w-[220px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }} /><select value={postSort} onChange={event => setPostSort(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}><option value="views">Sort: views</option><option value="reads">Sort: reads</option><option value="avgReadProgress">Sort: reading depth</option><option value="engagementRate">Sort: engagement</option></select></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left"><thead><tr className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{['Post', 'Views', 'Unique', 'Reads', 'Depth', 'Engagement'].map(label => <th key={label} className="px-4 py-3 font-semibold text-right first:text-left">{label}</th>)}</tr></thead><tbody>{posts.map(post => <tr key={post.id} className="border-t" style={{ borderColor: 'var(--border-default)' }}><td className="px-4 py-4"><p className="text-[13px] font-medium max-w-[300px] truncate" style={{ color: 'var(--text-primary)' }}>{post.title}</p><p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>{post.publishedAt ? new Date(post.publishedAt * 1000).toLocaleDateString() : 'Draft'}</p></td><td className="px-4 py-4 text-right text-[12px]">{fmt(post.views)}</td><td className="px-4 py-4 text-right text-[12px]">{fmt(post.uniqueVisitors)}</td><td className="px-4 py-4 text-right text-[12px]">{fmt(post.reads)}</td><td className="px-4 py-4 text-right text-[12px]">{post.avgReadProgress}%</td><td className="px-4 py-4 text-right text-[12px]">{post.engagementRate}%</td></tr>)}</tbody></table>{!posts.length && <p className="text-center py-16 text-[13px]" style={{ color: 'var(--text-faint)' }}>No matching published posts.</p>}</div>
          </section>}

          {tab === 'Audience' && <div className="space-y-5"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><MetricCard label="New readers" value={data.audience.newReaders} change={0} accent={palette.green} /><MetricCard label="Returning readers" value={data.audience.returningReaders} change={0} accent={palette.orange} /><MetricCard label="Signed-in readers" value={data.audience.signedIn} change={0} accent={palette.primary} /><MetricCard label="Anonymous readers" value={data.audience.anonymous} change={0} accent="#94a3b8" /></div><div className="grid md:grid-cols-2 gap-4"><Breakdown title="Devices" rows={data.audience.devices} accent={palette.primary} /><Breakdown title="Countries" rows={data.audience.countries} accent={palette.green} /></div></div>}

          {tab === 'Acquisition' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4"><Breakdown title="Traffic sources" rows={data.acquisition.sources} accent={palette.orange} /><Breakdown title="Top referrers" rows={data.acquisition.referrers} accent={palette.primary} /><Breakdown title="UTM campaigns" rows={data.acquisition.campaigns} accent={palette.green} /></div>}
        </>}
      </main>
    </AppShell>
  );
}
