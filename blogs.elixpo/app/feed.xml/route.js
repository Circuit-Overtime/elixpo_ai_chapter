export const runtime = 'edge';

import { getDB } from '../../lib/cloudflare';

const SITE_URL = 'https://blogs.elixpo.com';

function xml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function blogUrl(blog) {
  if (blog.collection_slug && blog.org_slug) return `${SITE_URL}/${blog.org_slug}/${blog.collection_slug}/${blog.slug}`;
  return `${SITE_URL}/${blog.org_slug || blog.author_username}/${blog.slug}`;
}

export async function GET() {
  try {
    const result = await getDB().prepare(`
      SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.published_at, b.updated_at,
        b.published_as, u.username AS author_username, u.display_name AS author_name,
        o.slug AS org_slug, c.slug AS collection_slug
      FROM blogs b JOIN users u ON u.id = b.author_id
      LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
      LEFT JOIN collections c ON c.id = b.collection_id
      WHERE b.status = 'published' AND b.secret = 0
      ORDER BY b.published_at DESC LIMIT 100
    `).all();
    const blogs = result?.results || [];
    const latest = blogs.reduce(
      (value, blog) => Math.max(value, Number(blog.updated_at || blog.published_at || 0)),
      0,
    ) || Math.floor(Date.now() / 1000);
    const items = blogs.map((blog) => {
      const url = blogUrl(blog);
      return `<item>
  <title>${xml(blog.title || 'Untitled')}</title>
  <link>${xml(url)}</link>
  <guid isPermaLink="true">${xml(url)}</guid>
  <description>${xml(blog.subtitle || blog.excerpt || `A story by ${blog.author_name || blog.author_username} on LixBlogs.`)}</description>
  <dc:creator>${xml(blog.author_name || blog.author_username)}</dc:creator>
  <pubDate>${new Date((blog.published_at || latest) * 1000).toUTCString()}</pubDate>
</item>`;
    }).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>LixBlogs — recent stories</title>
  <link>${SITE_URL}</link>
  <description>Recent stories published by writers and organizations on LixBlogs.</description>
  <language>en</language>
  <lastBuildDate>${new Date(latest * 1000).toUTCString()}</lastBuildDate>
  <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
  <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub" />
${items}
</channel>
</rss>`;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        // WebSub hubs fetch immediately after a publish notification. Revalidation
        // prevents the edge from handing the hub a feed that predates the post.
        'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
      },
    });
  } catch {
    return new Response('Feed temporarily unavailable', { status: 503 });
  }
}
