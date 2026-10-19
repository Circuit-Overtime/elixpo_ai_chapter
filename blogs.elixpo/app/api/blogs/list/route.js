export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // 'draft' | 'published' | 'unlisted' | null
  const filter = searchParams.get('filter'); // 'reshared' → blogs the user reposted
  const sort = searchParams.get('sort');      // 'views' | 'likes' | 'comments' | null (recent)
  const orderBy = sort === 'views' ? 'views DESC'
    : sort === 'likes' ? 'likes DESC'
    : sort === 'comments' ? 'comments DESC'
    : null;

  const COUNTS = `
    (SELECT COUNT(*) FROM blog_views WHERE blog_id = b.id) as views,
    (SELECT COUNT(*) FROM likes WHERE blog_id = b.id) as likes,
    (SELECT COUNT(*) FROM comments WHERE blog_id = b.id) as comments`;

  // These lists cover blogs written by OTHER people (reposted / co-authored), so a
  // secret blog here would hand the viewer its author. The owner's own list below is
  // exempt: it only ever returns the caller's own posts.
  const stripSecretAuthors = (rows) => (rows || []).map((b) => {
    if (!b.secret) return b;
    const { author_username, author_name, author_avatar, ...safe } = b;
    return safe;
  });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Reshared = blogs THIS user reposted (authored by others).
    if (filter === 'reshared') {
      const rows = await db.prepare(`
        SELECT b.id, b.id as slugid, b.slug, b.secret, b.title, b.subtitle, b.status,
          b.page_emoji, b.cover_image_r2_key, b.read_time_minutes,
          b.published_as, b.created_at, b.updated_at, b.published_at,
          u.username as author_username, u.display_name as author_name, u.avatar_url as author_avatar,
          r.created_at as reshared_at, ${COUNTS}
        FROM reposts r
        JOIN blogs b ON b.id = r.blog_id AND b.status = 'published'
        JOIN users u ON u.id = b.author_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC LIMIT 50
      `).bind(session.userId).all();
      return NextResponse.json({ blogs: stripSecretAuthors(rows?.results) });
    }

    // Co-authored = active blogs where THIS user is an accepted co-author
    // (authored by someone else). Drafts must remain reachable by editors here.
    if (filter === 'coauthored') {
      const rows = await db.prepare(`
        SELECT b.id, b.id as slugid, b.slug, b.secret, b.title, b.subtitle, b.status,
          b.page_emoji, b.cover_image_r2_key, b.read_time_minutes,
          b.published_as, b.created_at, b.updated_at, b.published_at,
          u.username as author_username, u.display_name as author_name, u.avatar_url as author_avatar,
          bc.role as co_author_role, bc.show_on_profile, ${COUNTS}
        FROM blog_co_authors bc
        JOIN blogs b ON b.id = bc.blog_id
          AND b.deleted_at IS NULL AND b.status IN ('draft', 'published', 'unlisted')
        JOIN users u ON u.id = b.author_id
        WHERE bc.user_id = ? AND bc.status = 'accepted' AND b.author_id != ?
        ORDER BY b.published_at DESC LIMIT 50
      `).bind(session.userId, session.userId).all();
      return NextResponse.json({ blogs: stripSecretAuthors(rows?.results) });
    }

    let query = `
      SELECT b.id, b.id as slugid, b.slug, b.secret, b.title, b.subtitle, b.status,
        b.page_emoji, b.cover_image_r2_key, b.read_time_minutes,
        b.published_as, b.created_at, b.updated_at, b.published_at,
        EXISTS(SELECT 1 FROM reposts WHERE blog_id = b.id) as is_reshared,
        ${COUNTS}
      FROM blogs b
      WHERE b.author_id = ?
    `;
    const params = [session.userId];

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ` ORDER BY ${orderBy || 'b.updated_at DESC'} LIMIT 50`;

    const blogs = await db.prepare(query).bind(...params).all();

    return NextResponse.json({ blogs: blogs?.results || [] });
  } catch (e) {
    console.error('List blogs error:', e);
    return NextResponse.json({ blogs: [] });
  }
}
