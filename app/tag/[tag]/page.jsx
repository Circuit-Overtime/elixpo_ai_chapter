export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDB } from '../../../lib/cloudflare';
import { safeJsonLd } from '../../../src/utils/seoContent';

const SITE_URL = 'https://blogs.elixpo.com';

function cleanTag(value) {
  return decodeURIComponent(String(value || '')).trim().toLowerCase().slice(0, 64);
}

const loadTag = cache(async (rawTag) => {
  const tag = cleanTag(rawTag);
  if (!tag) return null;
  const result = await getDB().prepare(`
    SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.cover_image_r2_key,
      b.published_at, b.updated_at, b.read_time_minutes, b.published_as,
      u.username AS author_username, u.display_name AS author_name,
      o.slug AS org_slug, o.name AS org_name, c.slug AS collection_slug
    FROM blog_tags bt
    JOIN blogs b ON b.id = bt.blog_id
    JOIN users u ON u.id = b.author_id
    LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    LEFT JOIN collections c ON c.id = b.collection_id
    WHERE LOWER(bt.tag) = ? AND b.status = 'published' AND b.secret = 0
    ORDER BY b.published_at DESC
    LIMIT 50
  `).bind(tag).all();
  const blogs = result?.results || [];
  return blogs.length ? { tag, blogs } : null;
});

function blogHref(blog) {
  if (blog.collection_slug && blog.org_slug) return `/${blog.org_slug}/${blog.collection_slug}/${blog.slug}`;
  return `/${blog.org_slug || blog.author_username}/${blog.slug}`;
}

export async function generateMetadata({ params }) {
  const { tag: rawTag } = await params;
  const data = await loadTag(rawTag).catch(() => null);
  if (!data) return { title: 'Topic not found', robots: { index: false, follow: false } };
  const label = data.tag.replace(/(^|[-_])\w/g, (part) => part.replace(/[-_]/, ' ').toUpperCase());
  const canonical = `${SITE_URL}/tag/${encodeURIComponent(data.tag)}`;
  const description = `Read ${data.blogs.length} ${data.blogs.length === 1 ? 'story' : 'stories'} about ${label} from writers and publications on LixBlogs.`;
  return {
    title: `${label} stories`,
    description,
    alternates: { canonical },
    openGraph: { type: 'website', title: `${label} stories on LixBlogs`, description, url: canonical, siteName: 'LixBlogs' },
    twitter: { card: 'summary', title: `${label} stories on LixBlogs`, description },
  };
}

export default async function TagPage({ params }) {
  const { tag: rawTag } = await params;
  const data = await loadTag(rawTag).catch(() => null);
  if (!data) notFound();
  const label = data.tag.replace(/(^|[-_])\w/g, (part) => part.replace(/[-_]/, ' ').toUpperCase());
  const canonical = `${SITE_URL}/tag/${encodeURIComponent(data.tag)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical}#collection`,
    url: canonical,
    name: `${label} stories on LixBlogs`,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: data.blogs.length,
      itemListElement: data.blogs.map((blog, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${blogHref(blog)}`,
        name: blog.title || 'Untitled',
      })),
    },
  };

  return (
    <main className="min-h-screen px-5 py-10" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div className="mx-auto max-w-3xl">
        <nav className="mb-10 flex items-center gap-3 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="font-semibold hover:text-[#9b7bf7]">LixBlogs</Link>
          <span style={{ color: 'var(--text-faint)' }}>/</span>
          <span style={{ color: 'var(--text-muted)' }}>Topics</span>
        </nav>
        <header className="mb-10 border-b pb-8" style={{ borderColor: 'var(--divider)' }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b7bf7]">Topic</p>
          <h1 className="mt-2 text-4xl font-extrabold">{label}</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>{data.blogs.length} published {data.blogs.length === 1 ? 'story' : 'stories'}</p>
        </header>
        <section aria-label={`${label} stories`}>
          {data.blogs.map((blog) => (
            <article key={blog.id} className="grid grid-cols-[1fr_auto] gap-5 border-b py-6" style={{ borderColor: 'var(--divider)' }}>
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  by <Link href={`/${blog.author_username}`} className="hover:text-[#9b7bf7]">{blog.author_name || blog.author_username}</Link>
                  {blog.org_name ? ` · ${blog.org_name}` : ''}
                </p>
                <h2 className="mt-2 text-xl font-bold leading-snug"><Link href={blogHref(blog)} className="hover:text-[#9b7bf7]">{blog.title || 'Untitled'}</Link></h2>
                {(blog.subtitle || blog.excerpt) && <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{blog.subtitle || blog.excerpt}</p>}
                <p className="mt-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                  {blog.published_at ? new Date(blog.published_at * 1000).toLocaleDateString('en', { dateStyle: 'medium', timeZone: 'UTC' }) : ''}
                  {blog.read_time_minutes ? ` · ${blog.read_time_minutes} min read` : ''}
                </p>
              </div>
              {blog.cover_image_r2_key && <img src={blog.cover_image_r2_key} alt="" loading="lazy" className="hidden h-24 w-32 rounded-xl object-cover sm:block" />}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
