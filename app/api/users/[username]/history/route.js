export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// GET — private: own read history only
export async function GET(request, { params }) {
  const { username } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const user = await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if (!user || user.id !== session.userId) return NextResponse.json({ error: 'Private' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await db.prepare(`
      SELECT rh.read_at, rh.read_progress,
        b.id, b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji, b.secret,
        b.read_time_minutes, b.published_at,
        CASE WHEN b.secret = 0 THEN u.username END as author_username,
        CASE WHEN b.secret = 0 THEN u.display_name END as author_name,
        CASE WHEN b.secret = 0 THEN u.avatar_url END as author_avatar
      FROM read_history rh
      JOIN blogs b ON b.id = rh.blog_id
      JOIN users u ON u.id = b.author_id
      WHERE rh.user_id = ?
      ORDER BY rh.read_at DESC
      LIMIT ? OFFSET ?
    `).bind(session.userId, limit, offset).all();

    return NextResponse.json({ blogs: result?.results || [] });
  } catch {
    return NextResponse.json({ blogs: [] });
  }
}
