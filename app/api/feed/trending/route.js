export const runtime = 'edge';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20);

  try {
    const { kvCache } = await import('../../../../lib/cache');
    const data = await kvCache(`v1:trending:${limit}`, 300, async () => {
      const { getDB } = await import('../../../../lib/cloudflare');
      const db = getDB();
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - 14 * 86400;

      const result = await db.prepare(`
        SELECT b.id, b.slug, b.secret, b.title, b.subtitle, b.page_emoji,
          b.author_id, b.published_as, b.published_at, b.read_time_minutes, b.like_count
        FROM blogs b
        WHERE b.status = 'published' AND b.published_at > ?
        ORDER BY b.like_count DESC, b.published_at DESC
        LIMIT ?
      `).bind(cutoff, limit).all();

      let posts = result?.results || [];
      if (posts.length > 0) {
        const authorIds = [...new Set(posts.map(p => p.author_id))];
        const placeholders = authorIds.map(() => '?').join(',');
        const authors = await db.prepare(
          `SELECT id, username, display_name, avatar_url FROM users WHERE id IN (${placeholders})`
        ).bind(...authorIds).all();
        const authorMap = Object.fromEntries((authors?.results || []).map(a => [a.id, a]));
        // Strip secret authors BEFORE this lands in the shared KV cache — this
        // payload is handed to every reader, so a leak here would be cached publicly.
        posts = posts.map(p => {
          if (p.secret) {
            const { author_id, ...rest } = p;
            return { ...rest, author: { username: null, display_name: 'Anonymous', avatar_url: null } };
          }
          return { ...p, author: authorMap[p.author_id] || { username: 'unknown' } };
        });

        // Fetch org names
        const orgIds = [...new Set(posts.filter(p => p.published_as?.startsWith('org:')).map(p => p.published_as.replace('org:', '')))];
        if (orgIds.length > 0) {
          const orgPlaceholders = orgIds.map(() => '?').join(',');
          const orgs = await db.prepare(
            `SELECT id, slug, name, logo_r2_key FROM orgs WHERE id IN (${orgPlaceholders})`
          ).bind(...orgIds).all();
          const orgMap = Object.fromEntries((orgs?.results || []).map(o => [o.id, o]));
          posts = posts.map(p => {
            const oid = p.published_as?.startsWith('org:') ? p.published_as.replace('org:', '') : null;
            return { ...p, org: oid && orgMap[oid] ? { id: orgMap[oid].id, slug: orgMap[oid].slug, name: orgMap[oid].name, logo_url: orgMap[oid].logo_r2_key } : null };
          });
        }
      }
      return { posts };
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Trending error:', e);
    return NextResponse.json({ posts: [] });
  }
}
