export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// GET — check like status + count
export async function GET(request, { params }) {
  const { slugid } = await params;
  const session = await getSession().catch(() => null);

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const [countRow, liked] = await Promise.all([
      db.prepare('SELECT COUNT(*) as c FROM likes WHERE blog_id = ?').bind(slugid).first(),
      session?.userId
        ? db.prepare('SELECT 1 FROM likes WHERE blog_id = ? AND user_id = ?').bind(slugid, session.userId).first()
        : null,
    ]);

    return NextResponse.json({ liked: !!liked, count: countRow?.c || 0 });
  } catch {
    return NextResponse.json({ liked: false, count: 0 });
  }
}

// POST — toggle like
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const existing = await db.prepare('SELECT 1 FROM likes WHERE blog_id = ? AND user_id = ?')
      .bind(slugid, session.userId).first();

    if (existing) {
      await db.prepare('DELETE FROM likes WHERE blog_id = ? AND user_id = ?').bind(slugid, session.userId).run();
      await db.prepare('UPDATE blogs SET like_count = MAX(0, like_count - 1) WHERE id = ?').bind(slugid).run();
    } else {
      await db.prepare('INSERT INTO likes (blog_id, user_id, created_at) VALUES (?, ?, unixepoch())')
        .bind(slugid, session.userId).run();
      await db.prepare('UPDATE blogs SET like_count = like_count + 1 WHERE id = ?').bind(slugid).run();

      // Record taste signal
      try { const { recordSignal } = await import('../../../../../lib/taste'); await recordSignal(db, session.userId, 'like', { blogId: slugid }); } catch {}

      // Notify blog author
      try {
        const blog = await db.prepare('SELECT author_id, title FROM blogs WHERE id = ?').bind(slugid).first();
        const user = await db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?').bind(session.userId).first();
        if (blog && blog.author_id !== session.userId) {
          const { notify } = await import('../../../../../lib/notify');
          const { getBlogCanonicalPath } = await import('../../../../../lib/blogUrl');
          await notify(db, {
            userId: blog.author_id, type: 'like',
            actorId: session.userId, actorName: user?.display_name || user?.username,
            actorAvatar: user?.avatar_url, targetId: slugid,
            targetTitle: blog.title, targetUrl: await getBlogCanonicalPath(db, slugid),
          });
        }
      } catch {}
    }

    const count = await db.prepare('SELECT like_count FROM blogs WHERE id = ?').bind(slugid).first();

    // Invalidate interaction cache
    try { const { kvInvalidate } = await import('../../../../../lib/cache'); await kvInvalidate(`v1:interactions:${slugid}`); } catch {}

    return NextResponse.json({ liked: !existing, count: count?.like_count || 0 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
