export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

const LOCK_TIMEOUT_SECONDS = 300; // 5 minutes — lock auto-expires without heartbeat

// POST — acquire or force-take editing lock
// Body: { blogId, force?: boolean }
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { blogId, force } = await request.json();
  if (!blogId) return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    const blog = await db.prepare(
      'SELECT editing_by, editing_since, author_id FROM blogs WHERE id = ?'
    ).bind(blogId).first();

    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });

    // Only users who can edit the blog may acquire/force its editing lock.
    const { canEditBlog } = await import('../../../../lib/permissions');
    const perm = await canEditBlog(db, blogId, session.userId);
    if (!perm.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Check if there's an active lock by someone else
    if (blog.editing_by && blog.editing_by !== session.userId) {
      const lockAge = now - (blog.editing_since || 0);
      const isExpired = lockAge > LOCK_TIMEOUT_SECONDS;

      if (!isExpired && !force) {
        // Look up who holds the lock
        const editor = await db.prepare(
          'SELECT username, display_name, avatar_url FROM users WHERE id = ?'
        ).bind(blog.editing_by).first();

        // This is expected advisory state in a collaborative editor, not a
        // failed request. Returning 200 avoids surfacing a false HTTP error;
        // the client can still display who currently owns the legacy lock.
        return NextResponse.json({
          locked: true,
          lockedBy: {
            userId: blog.editing_by,
            username: editor?.username || 'unknown',
            displayName: editor?.display_name || 'Someone',
            avatarUrl: editor?.avatar_url,
          },
          lockedSince: blog.editing_since,
          expiresIn: LOCK_TIMEOUT_SECONDS - lockAge,
        });
      }
      // Lock expired or force-take — fall through to acquire
    }

    // Acquire lock
    await db.prepare(
      'UPDATE blogs SET editing_by = ?, editing_since = ? WHERE id = ?'
    ).bind(session.userId, now, blogId).run();

    return NextResponse.json({ locked: false, acquired: true });
  } catch (e) {
    console.error('Lock acquire error:', e);
    return NextResponse.json({ error: 'Failed to acquire lock' }, { status: 500 });
  }
}

// DELETE — release editing lock
// Body: { blogId }
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { blogId } = await request.json();
  if (!blogId) return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Only release if this user holds the lock
    await db.prepare(
      'UPDATE blogs SET editing_by = NULL, editing_since = NULL WHERE id = ? AND editing_by = ?'
    ).bind(blogId, session.userId).run();

    return NextResponse.json({ released: true });
  } catch (e) {
    console.error('Lock release error:', e);
    return NextResponse.json({ error: 'Failed to release lock' }, { status: 500 });
  }
}
