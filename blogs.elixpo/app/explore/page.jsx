import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import AppShell from '../../src/components/AppShell';
import PublicStoryCard from '../../src/components/PublicStoryCard';
import { listPublicStories, publicStoryPath } from '../../lib/publicDiscovery';
import { safeJsonLd } from '../../src/utils/seoContent';
import { getSession } from '../../lib/auth';
import { getDB } from '../../lib/cloudflare';
import { loadRecommendationContext } from '../../lib/recommendations';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://blogs.elixpo.com';
const PAGE_SIZE = 12;

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page) {
  return page <= 1 ? '/explore' : `/explore?page=${page}`;
}

export async function generateMetadata({ searchParams }) {
  const params = searchParams ? await searchParams : {};
  const page = pageNumber(params.page);
  const canonical = `${SITE_URL}${pageHref(page)}`;
  return {
    title: page === 1 ? 'Explore stories' : `Explore stories — page ${page}`,
    description: 'Browse recent public stories from writers, developers, communities, and organizations on LixBlogs.',
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: page === 1 ? 'Explore stories on LixBlogs' : `Explore LixBlogs stories — page ${page}`,
      description: 'Recent public stories from creators and organizations on LixBlogs.',
      url: canonical,
      siteName: 'LixBlogs',
    },
  };
}

export default async function ExplorePage({ searchParams }) {
  const params = searchParams ? await searchParams : {};
  const page = pageNumber(params.page);
  const [session, requestHeaders] = await Promise.all([getSession().catch(() => null), headers()]);
  const recommendationContext = await loadRecommendationContext(getDB(), session?.userId, requestHeaders);
  const discovery = await listPublicStories({ page, pageSize: PAGE_SIZE, recommendationContext });
  if (page > discovery.pageCount) notFound();

  const canonical = `${SITE_URL}${pageHref(page)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical}#collection`,
    url: canonical,
    name: page === 1 ? 'Explore LixBlogs stories' : `Explore LixBlogs stories — page ${page}`,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: discovery.stories.map((story, index) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + index + 1,
        url: `${SITE_URL}${publicStoryPath(story)}`,
        name: story.title || 'Untitled',
      })),
    },
  };

  return (
    <AppShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
        <header className="border-b border-[var(--divider)] pb-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Public archive</p>
          <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-[-0.025em] text-[var(--text-primary)]">Explore stories</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[var(--text-muted)]">
            Stories ranked predictably by your topics, language, region, freshness, and quality.
          </p>
        </header>

        <section aria-label="Published stories">
          {discovery.stories.map((story) => <PublicStoryCard key={story.id} story={story} />)}
        </section>

        <nav className="flex items-center justify-between gap-4 py-9" aria-label="Story archive pages">
          {page > 1 ? (
            <Link rel="prev" href={pageHref(page - 1)} className="rounded-full border border-[var(--border-default)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              ← Newer stories
            </Link>
          ) : <span />}
          <span className="text-xs text-[var(--text-faint)]">Page {page} of {discovery.pageCount}</span>
          {page < discovery.pageCount ? (
            <Link rel="next" href={pageHref(page + 1)} className="rounded-full border border-[var(--border-default)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              Older stories →
            </Link>
          ) : <span />}
        </nav>
      </main>
    </AppShell>
  );
}
