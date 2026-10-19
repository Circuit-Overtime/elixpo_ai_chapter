export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// GET — user's read history
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const result = await db.prepare(`
      SELECT rh.read_at, rh.read_progress, rh.resume_progress,
        b.id as blog_id, b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji, b.secret,
        b.read_time_minutes, b.published_at,
        CASE WHEN b.secret = 0 THEN b.author_id END as author_id,
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

    return NextResponse.json({ history: result?.results || [], page, hasMore: (result?.results || []).length === limit });
  } catch {
    return NextResponse.json({ history: [] });
  }
}
