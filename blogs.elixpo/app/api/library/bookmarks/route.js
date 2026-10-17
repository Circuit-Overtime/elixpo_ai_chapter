export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// GET — list bookmarks, optionally filtered by collection
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('collection_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    let query = `
      SELECT bk.blog_id, bk.collection_id, bk.created_at as saved_at,
        b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji, b.secret,
        b.read_time_minutes, b.published_at,
        CASE WHEN b.secret = 0 THEN b.author_id END as author_id,
        CASE WHEN b.secret = 0 THEN u.username END as author_username,
        CASE WHEN b.secret = 0 THEN u.display_name END as author_name,
        CASE WHEN b.secret = 0 THEN u.avatar_url END as author_avatar
      FROM bookmarks bk
      JOIN blogs b ON b.id = bk.blog_id
      JOIN users u ON u.id = b.author_id
      WHERE bk.user_id = ?
    `;
    const binds = [session.userId];

    if (collectionId === 'default') {
      query += ' AND bk.collection_id IS NULL';
    } else if (collectionId) {
      query += ' AND bk.collection_id = ?';
      binds.push(collectionId);
    }

    query += ' ORDER BY bk.created_at DESC LIMIT ? OFFSET ?';
    binds.push(limit, offset);

    const result = await db.prepare(query).bind(...binds).all();

    return NextResponse.json({ bookmarks: result?.results || [], page, hasMore: (result?.results || []).length === limit });
  } catch (e) {
    console.error('Bookmarks error:', e);
    return NextResponse.json({ bookmarks: [] });
  }
}

// POST — save a blog
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { blogId, collectionId } = await request.json();
  if (!blogId) return NextResponse.json({ error: 'blogId required' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare(`
      INSERT INTO bookmarks (user_id, blog_id, collection_id, created_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id, blog_id) DO UPDATE SET collection_id = excluded.collection_id
    `).bind(session.userId, blogId, collectionId || null).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
