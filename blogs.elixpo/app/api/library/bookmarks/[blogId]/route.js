export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// PUT — move bookmark to different collection
export async function PUT(request, { params }) {
  const { blogId } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { collectionId } = await request.json();

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare('UPDATE bookmarks SET collection_id = ? WHERE user_id = ? AND blog_id = ?')
      .bind(collectionId || null, session.userId, blogId).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — remove bookmark
export async function DELETE(request, { params }) {
  const { blogId } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND blog_id = ?')
      .bind(session.userId, blogId).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
