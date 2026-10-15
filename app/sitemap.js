export const runtime = 'edge';
// Must run in the edge runtime: the URL list comes from D1. The database rows are
// cached briefly in KV so crawler bursts do not repeat the same five large queries.
// Publication mutations invalidate the shared key; five minutes is only the
// fallback window if a non-standard mutation path misses that invalidation.
export const dynamic = 'force-dynamic';

import { docsNavFlat } from '../src/config/docsNav';
import { kvCache, PUBLIC_SITEMAP_CACHE_KEY } from '../lib/cache';

const SITE_URL = 'https://blogs.elixpo.com';

// Dynamic sitemap.
//
// This replaces a hand-written public/sitemap.xml that listed 5 static pages and no
// content at all, so no blog, profile or organization was ever discoverable through
// it. Search engines had to find posts by crawling links alone.
//
// Excluded on purpose:
//   secret posts    — anonymous, and served noindex; listing them would invite the
//                     exact crawling we suppress everywhere else
//   unlisted posts  — deliberately kept out of public discovery by their author
//   drafts          — not public
// Omit lastmod if the source has no timestamp. Claiming "now" on every request
// makes the signal inaccurate and trains crawlers to ignore it.
const ts = (sec) => (sec ? new Date(sec * 1000) : undefined);

export default async function sitemap() {
  const staticPages = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/explore`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/docs`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/help`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/badges`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contests`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    ...docsNavFlat.map((doc) => ({
      url: `${SITE_URL}/docs/${doc.slug}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    })),
  ];

  try {
    const { getDB } = await import('../lib/cloudflare');
    const db = getDB();

    const [blogs, users, orgs, collections, curatedCollections, tags, contests] = await kvCache(PUBLIC_SITEMAP_CACHE_KEY, 300, () => Promise.all([
      db.prepare(`
        SELECT b.slug, b.updated_at, b.published_at, b.published_as,
               au.username AS author_username, o.slug AS org_slug, col.slug AS collection_slug
        FROM blogs b
        JOIN users au ON au.id = b.author_id
        LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
        LEFT JOIN collections col ON col.id = b.collection_id
        WHERE b.status = 'published' AND b.secret = 0
        ORDER BY b.published_at DESC
        LIMIT 38000
      `).all(),
      // Keep the complete sitemap under the protocol's 50,000 URL ceiling while
      // making room for substantially more individually indexed posts.
      db.prepare(`
        SELECT u.username, u.updated_at FROM users u
        WHERE u.username IS NOT NULL AND EXISTS (
          SELECT 1 FROM blogs b WHERE b.author_id = u.id AND b.status = 'published' AND b.secret = 0
        ) LIMIT 4000
      `).all(),
      db.prepare(`
        SELECT o.slug, o.updated_at FROM orgs o
        WHERE o.visibility != ? AND EXISTS (
          SELECT 1 FROM blogs b WHERE b.published_as = ('org:' || o.id) AND b.status = 'published' AND b.secret = 0
        ) LIMIT 2000
      `).bind('private').all(),
      db.prepare(`
        SELECT c.slug AS cslug, o.slug AS oslug, MAX(b.updated_at) AS updated_at
        FROM collections c JOIN orgs o ON o.id = c.org_id
        JOIN blogs b ON b.collection_id = c.id AND b.status = 'published' AND b.secret = 0
        WHERE o.visibility != ? GROUP BY c.id, c.slug, o.slug LIMIT 2000
      `).bind('private').all(),
      db.prepare(`
        SELECT bc.slug AS cslug, u.username, bc.updated_at
        FROM bookmark_collections bc
        JOIN users u ON u.id = bc.user_id
        WHERE bc.visibility = 'public' AND EXISTS (
          SELECT 1 FROM curated_collection_entries ce
          JOIN blogs b ON b.id = ce.blog_id
          WHERE ce.collection_id = bc.id AND b.status = 'published' AND b.secret = 0 AND b.deleted_at IS NULL
        )
        ORDER BY bc.updated_at DESC LIMIT 2000
      `).all(),
      db.prepare(`
        SELECT MIN(bt.tag) AS tag, MAX(b.updated_at) AS updated_at
        FROM blog_tags bt JOIN blogs b ON b.id = bt.blog_id
        WHERE b.status = 'published' AND b.secret = 0
        GROUP BY LOWER(bt.tag)
        ORDER BY COUNT(*) DESC LIMIT 2000
      `).all(),
      db.prepare(`
        SELECT slug, status, updated_at FROM contests
        WHERE status != 'draft'
        ORDER BY starts_at DESC LIMIT 2000
      `).all(),
    ]));

    const blogUrls = (blogs?.results || []).map((b) => {
      const owner = b.published_as?.startsWith('org:') ? b.org_slug : b.author_username;
      if (!owner || !b.slug) return null;
      const enc = (s) => encodeURIComponent(s);
      const path = b.collection_slug && b.org_slug
        ? `${enc(b.org_slug)}/${enc(b.collection_slug)}/${enc(b.slug)}`
        : `${enc(owner)}/${enc(b.slug)}`;
      return {
        url: `${SITE_URL}/${path}`,
        lastModified: ts(b.updated_at || b.published_at),
        changeFrequency: 'weekly',
        priority: 0.9,
      };
    }).filter(Boolean);

    const userUrls = (users?.results || []).map((u) => ({
      url: `${SITE_URL}/${encodeURIComponent(u.username)}`,
      lastModified: ts(u.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const orgUrls = (orgs?.results || []).map((o) => ({
      url: `${SITE_URL}/${encodeURIComponent(o.slug)}`,
      lastModified: ts(o.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const collectionUrls = (collections?.results || []).map((c) => ({
      url: `${SITE_URL}/${encodeURIComponent(c.oslug)}/${encodeURIComponent(c.cslug)}`,
      lastModified: ts(c.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const curatedCollectionUrls = (curatedCollections?.results || []).map((c) => ({
      url: `${SITE_URL}/${encodeURIComponent(c.username)}/reads/${encodeURIComponent(c.cslug)}`,
      lastModified: ts(c.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const tagUrls = (tags?.results || []).filter((row) => row.tag).map((row) => ({
      url: `${SITE_URL}/tag/${encodeURIComponent(row.tag.toLowerCase())}`,
      lastModified: ts(row.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const contestUrls = (contests?.results || []).map((contest) => ({
      url: `${SITE_URL}/contests/${encodeURIComponent(contest.slug)}`,
      lastModified: ts(contest.updated_at),
      changeFrequency: contest.status === 'completed' || contest.status === 'cancelled' ? 'monthly' : 'daily',
      priority: 0.7,
    }));

    return [...staticPages, ...blogUrls, ...userUrls, ...orgUrls, ...collectionUrls, ...curatedCollectionUrls, ...tagUrls, ...contestUrls];
  } catch {
    // D1 unavailable (local dev, or a bad deploy): still serve the static pages
    // rather than a 500, which search engines treat as a broken sitemap.
    return staticPages;
  }
}
