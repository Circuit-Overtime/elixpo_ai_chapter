export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { parseSearchQuery, buildBlogSearch, isEmptyQuery } from '../../../../lib/searchQuery';

// Granular blog search with selectable fields.
//
// ?q=query&fields=slugid,slug,title,author,tags,views,likes,comments
//
// `q` supports the LixBlogs search protocol (tag:, author:, org:, in:, is:, sort:,
// created:, quoted phrases, - negation) — see docs/search-syntax.md and lib/searchQuery.js.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const fields = (searchParams.get('fields') || 'slugid,slug,title').split(',').map(f => f.trim());
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
  const status = searchParams.get('status') || 'published,unlisted';

  const parsed = parseSearchQuery(q);
  // A bare word still needs 2+ chars, but `tag:ai` alone is a perfectly good query
  // with no free text at all — so the length floor only applies to free text.
  const freeText = [...parsed.text, ...parsed.phrases].join('');
  if (isEmptyQuery(parsed) || (freeText.length > 0 && freeText.length < 2)) {
    return NextResponse.json({ blogs: [], unknown: parsed.unknown });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const defaultStatus = status.split(',').map(s => s.trim()).filter(Boolean);
    const { where, binds, orderBy } = buildBlogSearch(parsed, { defaultStatus });

    const base = await db.prepare(`
      SELECT b.id as slugid, b.slug, b.title, b.subtitle, b.page_emoji, b.cover_image_r2_key, b.secret,
        b.read_time_minutes, b.published_at, b.author_id, b.status,
        au.username as author_username, au.display_name as author_name, au.avatar_url as author_avatar,
        o.slug as org_slug, o.name as org_name
      FROM blogs b
      JOIN users au ON au.id = b.author_id
      LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ?
    `).bind(...binds, limit).all();

    const blogs = (base?.results || []).map((b) => {
      if (!b.secret) return b;
      const { author_id, author_username, author_name, author_avatar, ...safe } = b;
      return safe;
    });

    // Enrich with optional counts
    if (blogs.length > 0) {
      for (const b of blogs) {
        if (fields.includes('views')) {
          const vc = await db.prepare('SELECT COUNT(*) as c FROM blog_views WHERE blog_id = ?').bind(b.slugid).first();
          b.views = vc?.c || 0;
        }
        if (fields.includes('likes')) {
          const lc = await db.prepare('SELECT COUNT(*) as c FROM likes WHERE blog_id = ?').bind(b.slugid).first();
          b.likes = lc?.c || 0;
        }
        if (fields.includes('comments')) {
          const cc = await db.prepare('SELECT COUNT(*) as c FROM comments WHERE blog_id = ?').bind(b.slugid).first();
          b.comments = cc?.c || 0;
        }
        if (fields.includes('tags')) {
          const tags = await db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ?').bind(b.slugid).all();
          b.tags = (tags?.results || []).map(t => t.tag);
        }
      }
    }

    // `unknown` lets the UI say "athor:x isn't a qualifier, it was searched as text"
    // instead of quietly returning odd results.
    return NextResponse.json({ blogs, unknown: parsed.unknown });
  } catch (e) {
    // Log it. A bare `catch {}` here previously turned a SQL syntax error into a
    // silent, permanently-empty result set — the endpoint looked like it simply
    // found nothing, for every query, and nothing surfaced the real cause.
    console.error('Blog search failed:', e?.message || e);
    return NextResponse.json({ blogs: [] });
  }
}
