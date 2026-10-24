export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// GET — all interaction state for a blog in one call
export async function GET(request, { params }) {
  const { slugid } = await params;
  const session = await getSession().catch(() => null);
  const userId = session?.userId;

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const { kvCache } = await import('../../../../../lib/cache');
    const db = getDB();

    // Public counts — cached (denormalized, single row read)
    const publicCounts = await kvCache(`v1:interactions:${slugid}`, 60, async () => {
      const blog = await db.prepare(
        'SELECT like_count, clap_total, comment_count, view_count FROM blogs WHERE id = ?'
      ).bind(slugid).first();
      return {
        likeCount: blog?.like_count || 0,
        totalClaps: blog?.clap_total || 0,
        commentCount: blog?.comment_count || 0,
        viewCount: blog?.view_count || 0,
      };
    });

    // Per-user state — NOT cached, must be real-time
    let userState = { liked: false, userClaps: 0, bookmarked: false, bookmarkCollectionId: null, readProgress: 0 };
    if (userId) {
      const [liked, claps, bookmark, progress] = await Promise.all([
        db.prepare('SELECT 1 FROM likes WHERE blog_id = ? AND user_id = ?').bind(slugid, userId).first(),
        db.prepare('SELECT count FROM claps WHERE blog_id = ? AND user_id = ?').bind(slugid, userId).first(),
        db.prepare('SELECT collection_id FROM bookmarks WHERE blog_id = ? AND user_id = ?').bind(slugid, userId).first(),
        db.prepare('SELECT read_progress FROM read_history WHERE blog_id = ? AND user_id = ?').bind(slugid, userId).first(),
      ]);
      userState = {
        liked: !!liked,
        userClaps: claps?.count || 0,
        bookmarked: !!bookmark,
        bookmarkCollectionId: bookmark?.collection_id || null,
        readProgress: progress?.read_progress || 0,
      };
    }

    return NextResponse.json({ ...publicCounts, ...userState });
  } catch {
    return NextResponse.json({ likeCount: 0, totalClaps: 0, commentCount: 0, viewCount: 0, liked: false, userClaps: 0, bookmarked: false, readProgress: 0 });
  }
}
