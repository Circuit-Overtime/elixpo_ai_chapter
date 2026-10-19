export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

// Lightweight combined search — returns minimal fields only
// For detailed data, use /api/search/users, /api/search/orgs, /api/search/blogs
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const scope = searchParams.get('scope') || 'all'; // all | users | orgs | blogs

  if (!q || q.length < 1) {
    return NextResponse.json({ users: [], orgs: [], blogs: [] });
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const pattern = `%${q}%`;

    const results = { users: [], orgs: [], blogs: [] };

    if (scope === 'all' || scope === 'users') {
      const users = await db.prepare(`
        SELECT id, username, display_name, avatar_url
        FROM users WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?
        LIMIT 5
      `).bind(pattern, pattern).all();
      results.users = users?.results || [];
    }

    if (scope === 'all' || scope === 'orgs') {
      // Private orgs stay out of search for everyone but their own members/owner —
      // same rule as /api/search/orgs. A signed-out viewer binds NULL and matches
      // neither branch, so they see public orgs only.
      const session = await getSession().catch(() => null);
      const viewerId = session?.userId || null;
      const orgs = await db.prepare(`
        SELECT id, slug, name, tagline, logo_url
        FROM orgs
        WHERE (LOWER(slug) LIKE ? OR LOWER(name) LIKE ? OR LOWER(tagline) LIKE ?)
          AND (
            visibility != 'private'
            OR owner_id = ?
            OR id IN (SELECT org_id FROM org_members WHERE user_id = ?)
          )
        LIMIT 5
      `).bind(pattern, pattern, pattern, viewerId, viewerId).all();
      results.orgs = orgs?.results || [];
    }

    if (scope === 'all' || scope === 'blogs') {
      const blogs = await db.prepare(`
        SELECT b.id as slugid, b.slug, b.secret, b.title, u.username AS author_username
        FROM blogs b JOIN users u ON u.id = b.author_id
        WHERE (LOWER(b.title) LIKE ? OR LOWER(b.slug) LIKE ?) AND b.status IN ('published', 'unlisted')
        LIMIT 5
      `).bind(pattern, pattern).all();
      // A secret blog stays findable by title, but its author must never ride along:
      // this endpoint is public and unauthenticated, so returning author_username here
      // would let anyone deanonymize a post just by searching for its title.
      results.blogs = (blogs?.results || []).map((b) => (b.secret ? { ...b, author_username: null } : b));
    }

    return NextResponse.json(results);
  } catch {
    // D1 not available — fallback to session user
    try {
      const session = await getSession();
      const users = [];
      if (session?.profile) {
        const p = session.profile;
        if ((p.username || '').toLowerCase().includes(q) || (p.display_name || '').toLowerCase().includes(q)) {
          users.push({ id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url });
        }
      }
      return NextResponse.json({ users, orgs: [], blogs: [] });
    } catch {
      return NextResponse.json({ users: [], orgs: [], blogs: [] });
    }
  }
}
