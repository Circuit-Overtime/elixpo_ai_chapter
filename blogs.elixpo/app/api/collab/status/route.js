export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// GET /api/collab/status?blogId=xxx — check who's editing + if collab is needed
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId');
  if (!blogId) return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    // Get blog lock state + co-author count
    const blog = await db.prepare(
      'SELECT editing_by, editing_since, author_id FROM blogs WHERE id = ?'
    ).bind(blogId).first();

    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });

    // Check if lock is still active (not expired)
    const lockTimeout = 300; // 5 min
    const isLocked = blog.editing_by && (now - (blog.editing_since || 0)) < lockTimeout;

    let lockedBy = null;
    if (isLocked && blog.editing_by !== session.userId) {
      const editor = await db.prepare(
        'SELECT username, display_name, avatar_url FROM users WHERE id = ?'
      ).bind(blog.editing_by).first();
      lockedBy = {
        userId: blog.editing_by,
        username: editor?.username,
        displayName: editor?.display_name,
        avatarUrl: editor?.avatar_url,
      };
    }

    // Count co-authors to determine if collab mode should be enabled
    const coAuthors = await db.prepare(
      "SELECT COUNT(*) as count FROM blog_co_authors WHERE blog_id = ? AND status = 'accepted'"
    ).bind(blogId).first();

    const hasCollaborators = (coAuthors?.count || 0) > 0;

    return NextResponse.json({
      isLocked: isLocked && blog.editing_by !== session.userId,
      isMine: blog.editing_by === session.userId,
      lockedBy,
      hasCollaborators,
      isAuthor: blog.author_id === session.userId,
    });
  } catch (e) {
    console.error('Collab status error:', e);
    return NextResponse.json({ isLocked: false, hasCollaborators: false });
  }
}
