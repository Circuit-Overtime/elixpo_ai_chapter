export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { diversifyBlogs } from '../../../../../lib/recommendations';

const FIELDS = `b.id, b.slug, b.title, b.subtitle, b.cover_image_r2_key,
  b.author_id, b.published_as, b.published_at, b.read_time_minutes, b.like_count, b.comment_count`;
const EXCLUDE_TEST = "b.author_id NOT IN (SELECT id FROM users WHERE LOWER(username) = 'selenium-cutlet')";

// GET — related stories with a deterministic author-diversity pass. Relevance
// still comes first, but a prolific writer cannot fill the whole module.
export async function GET(request, { params }) {
  const { slugid } = await params;
  const limit = 4;
  const candidateLimit = 16;
  const maxCandidates = candidateLimit * 3;
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const blog = await db.prepare('SELECT id, author_id, secret FROM blogs WHERE id = ?').bind(slugid).first();
    // Same-author recommendations would identify the writer of a secret post.
    const authorId = blog?.secret ? null : blog?.author_id || null;

    const candidates = [];
    const seen = new Set([slugid]);
    const add = (rows) => {
      for (const r of rows) {
        if (candidates.length >= maxCandidates) break;
        if (!seen.has(r.id)) { seen.add(r.id); candidates.push(r); }
      }
    };

    // 1) Shares a tag with this blog.
    const tagRows = await db.prepare(`
      SELECT ${FIELDS} FROM blogs b
      WHERE b.status = 'published' AND b.secret = 0 AND b.id != ? AND ${EXCLUDE_TEST}
        AND b.id IN (
          SELECT blog_id FROM blog_tags WHERE tag IN (SELECT tag FROM blog_tags WHERE blog_id = ?)
        )
      ORDER BY b.like_count DESC, b.published_at DESC LIMIT ?
    `).bind(slugid, slugid, candidateLimit).all();
    add(tagRows?.results || []);

    // 2) More from the same author.
    if (authorId) {
      const moreRows = await db.prepare(`
        SELECT ${FIELDS} FROM blogs b
        WHERE b.status = 'published' AND b.secret = 0 AND b.author_id = ? AND b.id != ?
        ORDER BY b.published_at DESC LIMIT ?
      `).bind(authorId, slugid, candidateLimit).all();
      add(moreRows?.results || []);
    }

    // 3) Trending fallback.
    const trend = await db.prepare(`
      SELECT ${FIELDS} FROM blogs b
      WHERE b.status = 'published' AND b.secret = 0 AND b.id != ? AND ${EXCLUDE_TEST}
      ORDER BY b.like_count DESC, b.view_count DESC, b.published_at DESC LIMIT ?
    `).bind(slugid, candidateLimit).all();
    add(trend?.results || []);

    const picked = diversifyBlogs(candidates, { windowSize: limit, maxPerAuthor: 1 }).slice(0, limit);
    if (picked.length === 0) return NextResponse.json({ posts: [] });

    // Enrich with author + org.
    const authorIds = [...new Set(picked.map(p => p.author_id))];
    const aPh = authorIds.map(() => '?').join(',');
    const authors = await db.prepare(`SELECT id, username, display_name, avatar_url FROM users WHERE id IN (${aPh})`).bind(...authorIds).all();
    const aMap = Object.fromEntries((authors?.results || []).map(a => [a.id, a]));

    const orgIds = [...new Set(picked.filter(p => p.published_as?.startsWith('org:')).map(p => p.published_as.slice(4)))];
    let oMap = {};
    if (orgIds.length) {
      const oPh = orgIds.map(() => '?').join(',');
      const orgs = await db.prepare(`SELECT id, slug, name, logo_r2_key FROM orgs WHERE id IN (${oPh})`).bind(...orgIds).all();
      oMap = Object.fromEntries((orgs?.results || []).map(o => [o.id, o]));
    }

    const posts = picked.map(p => {
      const orgId = p.published_as?.startsWith('org:') ? p.published_as.slice(4) : null;
      const o = orgId ? oMap[orgId] : null;
      return {
        ...p,
        author: aMap[p.author_id] || { username: 'unknown', display_name: 'Unknown' },
        org: o ? { slug: o.slug, name: o.name, logo_url: o.logo_r2_key } : null,
      };
    });
    return NextResponse.json({ posts });
  } catch (e) {
    return NextResponse.json({ posts: [] });
  }
}
