export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// Author + accepted co-authors can't repost their own blog.
async function isOwnBlog(db, blogId, userId) {
  const blog = await db.prepare('SELECT author_id FROM blogs WHERE id = ?').bind(blogId).first();
  if (!blog) return { notFound: true };
  if (blog.author_id === userId) return { own: true };
  const co = await db.prepare(
    "SELECT 1 FROM blog_co_authors WHERE blog_id = ? AND user_id = ? AND status = 'accepted'"
  ).bind(blogId, userId).first();
  return { own: !!co };
}

// GET — { count, reposted }
export async function GET(request, { params }) {
  const { slugid } = await params;
  const session = await getSession().catch(() => null);
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM reposts WHERE blog_id = ?').bind(slugid).first();
    let reposted = false;
    if (session?.userId) {
      const row = await db.prepare('SELECT 1 FROM reposts WHERE blog_id = ? AND user_id = ?').bind(slugid, session.userId).first();
      reposted = !!row;
    }
    return NextResponse.json({ count: countRow?.c || 0, reposted });
  } catch {
    return NextResponse.json({ count: 0, reposted: false });
  }
}

// POST — repost
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const own = await isOwnBlog(db, slugid, session.userId);
    if (own.notFound) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    if (own.own) return NextResponse.json({ error: "You can't repost your own blog" }, { status: 400 });
    const wasNew = await db.prepare('SELECT 1 FROM reposts WHERE user_id = ? AND blog_id = ?').bind(session.userId, slugid).first();
    await db.prepare('INSERT OR IGNORE INTO reposts (user_id, blog_id) VALUES (?, ?)').bind(session.userId, slugid).run();
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM reposts WHERE blog_id = ?').bind(slugid).first();

    // Notify the blog owner (best-effort, only on a fresh repost).
    if (!wasNew) {
      try {
        const { notify } = await import('../../../../../lib/notify');
        const blog = await db.prepare(
          'SELECT b.author_id, b.slug, u.username FROM blogs b JOIN users u ON u.id = b.author_id WHERE b.id = ?'
        ).bind(slugid).first();
        if (blog && blog.author_id !== session.userId) {
          const actor = session.profile || {};
          await notify(db, {
            userId: blog.author_id,
            type: 'repost',
            actorId: session.userId,
            actorName: actor.display_name || actor.username || 'Someone',
            actorAvatar: actor.avatar_url || '',
            targetUrl: `/${blog.username}/${blog.slug}`,
          });
        }
      } catch {}
    }

    return NextResponse.json({ reposted: true, count: countRow?.c || 0 });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — undo repost
export async function DELETE(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    await db.prepare('DELETE FROM reposts WHERE user_id = ? AND blog_id = ?').bind(session.userId, slugid).run();
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM reposts WHERE blog_id = ?').bind(slugid).first();
    return NextResponse.json({ reposted: false, count: countRow?.c || 0 });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
