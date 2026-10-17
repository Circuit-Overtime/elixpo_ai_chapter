export const runtime = 'edge';
import { NextResponse } from 'next/server';

// GET — public: blogs this user liked
export async function GET(request, { params }) {
  const { username } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const user = await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await db.prepare(`
      SELECT l.created_at as liked_at,
        b.id, b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji,
        b.read_time_minutes, b.published_at,
        u.username as author_username, u.display_name as author_name, u.avatar_url as author_avatar
      FROM likes l
      JOIN blogs b ON b.id = l.blog_id AND b.status = 'published' AND b.secret = 0
      JOIN users u ON u.id = b.author_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    return NextResponse.json({ blogs: result?.results || [] });
  } catch {
    return NextResponse.json({ blogs: [] });
  }
}
