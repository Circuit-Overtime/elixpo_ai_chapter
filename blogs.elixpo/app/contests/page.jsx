import Link from 'next/link';
import { headers } from 'next/headers';
import AppShell from '../../src/components/AppShell';
import { getDB } from '../../lib/cloudflare';
import { getSession } from '../../lib/auth';
import { serializeContest } from '../../lib/contests';
import { loadRecommendationContext, rankContests } from '../../lib/recommendations';
import { safeJsonLd } from '../../src/utils/seoContent';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Writing contests',
  description: 'Join time-bound writing contests on LixBlogs, publish your response, and explore recognized entries.',
  alternates: { canonical: 'https://blogs.elixpo.com/contests' },
  robots: { index: true, follow: true },
};

const filters = [
  { value: 'all', label: 'All contests' },
  { value: 'live', label: 'Open now' },
  { value: 'scheduled', label: 'Upcoming' },
  { value: 'judging', label: 'In judging' },
  { value: 'completed', label: 'Completed' },
];

const statusStyles = {
  live: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  judging: 'bg-amber-500/14 text-amber-700 dark:text-amber-400',
  completed: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  cancelled: 'bg-red-500/10 text-red-500',
};

function formatDate(value) {
  if (!value) return 'Date not set';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value * 1000));
}

function timeRemaining(value) {
  const seconds = Number(value || 0) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return 'closed';
  const days = Math.ceil(seconds / 86400);
  if (days > 1) return `${days} days left`;
  const hours = Math.max(1, Math.ceil(seconds / 3600));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
}

function timing(contest) {
  if (contest.status === 'scheduled') return `Starts ${formatDate(contest.startsAt)}`;
  if (contest.status === 'live') return `Ends ${formatDate(contest.submissionsCloseAt)} · ${timeRemaining(contest.submissionsCloseAt)}`;
  if (contest.status === 'judging') return `Results by ${formatDate(contest.judgingClosesAt)}`;
  if (contest.status === 'completed') return `Completed ${formatDate(contest.resultsAt || contest.judgingClosesAt)}`;
  return 'Contest cancelled';
}

function StatusBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusStyles[status] || statusStyles.completed}`}>{status}</span>;
}

function Organizer({ contest }) {
  return <div className="flex min-w-0 items-center gap-2">{contest.organizer.avatarUrl ? <img src={contest.organizer.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-subtle)] text-[10px] font-bold text-[var(--accent)]">{String(contest.organizer.displayName || contest.organizer.username || '?').slice(0, 1).toUpperCase()}</span>}<span className="truncate text-xs text-[var(--text-muted)]">Hosted by <strong className="font-semibold text-[var(--text-secondary)]">@{contest.organizer.username}</strong></span></div>;
}

function ContestCard({ contest }) {
  return (
    <Link href={`/contests/${contest.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-xl">
      <div className="relative overflow-hidden">
        {contest.coverUrl ? <img src={contest.coverUrl} alt="" className="h-44 w-full object-cover transition duration-500 group-hover:scale-[1.025]" /> : <div className="h-44 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,0.3),transparent_35%),radial-gradient(circle_at_80%_75%,rgba(245,158,11,0.24),transparent_38%),linear-gradient(135deg,var(--bg-surface),var(--card-bg))]"><div className="grid h-full place-items-center text-4xl text-[var(--accent)]"><ion-icon name="trophy-outline" /></div></div>}
        <div className="absolute left-4 top-4"><StatusBadge status={contest.status} /></div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {contest.recommendation_reason?.[0] && <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-faint)]"><ion-icon name="sparkles-outline" />Suggested · {contest.recommendation_reason[0]}</p>}
        {contest.theme && <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{contest.theme}</p>}
        <h2 className="mt-2 line-clamp-2 font-serif text-xl font-bold leading-7 text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{contest.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-muted)]">{contest.description || contest.problemStatement}</p>
        {contest.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{contest.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]">#{tag}</span>)}</div>}
        <div className="mt-auto pt-5"><div className="flex items-center justify-between gap-3 border-t border-[var(--divider)] pt-4"><Organizer contest={contest} /><span className="shrink-0 text-xs font-semibold text-[var(--text-faint)]">{contest.submissionCount} {contest.submissionCount === 1 ? 'entry' : 'entries'}</span></div><p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]"><ion-icon name="time-outline" />{timing(contest)}</p>{contest.status === 'scheduled' && <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Entries end {formatDate(contest.submissionsCloseAt)}</p>}</div>
      </div>
    </Link>
  );
}

export default async function ContestsPage({ searchParams }) {
  const requestedFilter = String((await searchParams)?.status || 'all');
  const activeFilter = filters.some((item) => item.value === requestedFilter) ? requestedFilter : 'all';
  let contests = [];
  try {
    const db = getDB();
    const rows = await db.prepare(`SELECT c.*, u.username AS organizer_username,
      u.display_name AS organizer_name, u.avatar_url AS organizer_avatar,
      (SELECT COUNT(*) FROM contest_submissions s WHERE s.contest_id = c.id AND s.withdrawn_at IS NULL) AS submission_count
      FROM contests c JOIN users u ON u.id = c.organizer_id
      WHERE c.status != 'draft' ORDER BY c.starts_at DESC LIMIT 100`).all();
    contests = (rows?.results || []).map((row) => serializeContest(row));
    const [session, requestHeaders] = await Promise.all([getSession().catch(() => null), headers()]);
    const context = await loadRecommendationContext(db, session?.userId, requestHeaders);
    contests = rankContests(contests, context);
  } catch {}
  const visibleContests = activeFilter === 'all' ? contests : contests.filter((contest) => contest.status === activeFilter);
  const featured = activeFilter === 'all' ? visibleContests.find((contest) => contest.status === 'live') : null;
  const remaining = featured ? visibleContests.filter((contest) => contest.id !== featured.id) : visibleContests;
  const liveCount = contests.filter((contest) => contest.status === 'live').length;
  const upcomingCount = contests.filter((contest) => contest.status === 'scheduled').length;
  const totalEntries = contests.reduce((total, contest) => total + contest.submissionCount, 0);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'LixBlogs writing contests', url: 'https://blogs.elixpo.com/contests',
    mainEntity: { '@type': 'ItemList', itemListElement: contests.map((contest, index) => ({
      '@type': 'ListItem', position: index + 1, name: contest.title,
      url: `https://blogs.elixpo.com/contests/${contest.slug}`,
    })) },
  };
  return (
    <AppShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="relative overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--card-bg)] px-6 py-8 sm:px-9 sm:py-10">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(139,92,246,0.2),transparent_32%),radial-gradient(circle_at_90%_80%,rgba(245,158,11,0.16),transparent_34%)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl"><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]"><ion-icon name="trophy-outline" />Write with a prompt</p><h1 className="mt-3 font-serif text-4xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-5xl">Ideas deserve a challenge.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-muted)]">Join time-bound writing contests, publish your perspective, and earn recognition from named organizers and judges.</p></div>
            <Link href="/contests/new" className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5"><ion-icon name="add-outline" />Create a contest</Link>
          </div>
          <dl className="relative mt-8 grid max-w-xl grid-cols-3 divide-x divide-[var(--divider)] rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-4"><div className="px-4"><dt className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Open now</dt><dd className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">{liveCount}</dd></div><div className="px-4"><dt className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Upcoming</dt><dd className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">{upcomingCount}</dd></div><div className="px-4"><dt className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Entries</dt><dd className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">{totalEntries}</dd></div></dl>
        </header>

        {featured && <section className="mt-7" aria-labelledby="featured-contest"><div className="mb-3 flex items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Accepting entries</p><h2 id="featured-contest" className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">Featured contest</h2></div><Link href={`/contests/${featured.slug}`} className="text-xs font-bold text-[var(--accent)]">All details →</Link></div><Link href={`/contests/${featured.slug}#enter-contest`} className="group grid overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--card-bg)] transition hover:border-[var(--accent)] hover:shadow-lg md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">{featured.coverUrl ? <img src={featured.coverUrl} alt="" className="h-48 w-full object-cover md:h-64" /> : <div className="grid h-48 place-items-center bg-[radial-gradient(circle_at_30%_30%,rgba(139,92,246,0.35),transparent_38%),linear-gradient(135deg,var(--bg-surface),var(--card-bg))] text-5xl text-[var(--accent)] md:h-64"><ion-icon name="trophy-outline" /></div>}<div className="flex min-w-0 flex-col p-5 sm:p-6"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={featured.status} />{featured.theme && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]">{featured.theme}</span>}</div><h3 className="mt-3 line-clamp-2 font-serif text-2xl font-extrabold leading-tight text-[var(--text-primary)] transition group-hover:text-[var(--accent)] sm:text-3xl">{featured.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-muted)]">{featured.description || featured.problemStatement}</p><div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5"><div><Organizer contest={featured} /><p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><ion-icon name="time-outline" />{timing(featured)}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">{featured.submissionCount} {featured.submissionCount === 1 ? 'entry' : 'entries'}</span><span className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white">Enter contest</span></div></div></div></Link></section>}

        <section className="py-9" aria-labelledby="browse-contests">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Discover</p><h2 id="browse-contests" className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">Browse contests</h2></div><nav aria-label="Filter contests" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{filters.map((filter) => <Link key={filter.value} href={filter.value === 'all' ? '/contests' : `/contests?status=${filter.value}`} scroll={false} aria-current={activeFilter === filter.value ? 'page' : undefined} className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${activeFilter === filter.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'}`}>{filter.label}</Link>)}</nav></div>
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{remaining.map((contest) => <ContestCard key={contest.id} contest={contest} />)}</div>
          {!remaining.length && <div className="mt-6 rounded-3xl border border-dashed border-[var(--border-default)] bg-[var(--card-bg)] px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-subtle)] text-2xl text-[var(--accent)]"><ion-icon name="trophy-outline" /></span><h3 className="mt-4 font-serif text-xl font-bold text-[var(--text-primary)]">{featured ? 'No other contests yet' : contests.length ? 'No contests in this stage' : 'The first contest starts with you'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">{featured ? 'The featured contest is currently the only published opportunity.' : contests.length ? 'Choose another filter to explore active, upcoming, and completed contests.' : 'Create a prompt, set fair rules and deadlines, then invite the community to write.'}</p>{!contests.length && <Link href="/contests/new" className="mt-5 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Create the first contest</Link>}</div>}
        </section>
      </main>
    </AppShell>
  );
}
