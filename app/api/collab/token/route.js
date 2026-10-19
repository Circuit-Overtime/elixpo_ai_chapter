export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession, signSession } from '../../../../lib/auth';

const COLLAB_TOKEN_TTL_SECONDS = 60 * 60 * 6;

// GET /api/collab/token?blogId=<id>
// Issues a short-lived, blog-scoped credential for the collaboration worker.
// A normal browser session cookie cannot be sent to the workers.dev domain.
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const blogId = new URL(request.url).searchParams.get('blogId');
  if (!blogId) {
    return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });
  }

  try {
    const [{ getDB }, { canEditBlog }] = await Promise.all([
      import('../../../../lib/cloudflare'),
      import('../../../../lib/permissions'),
    ]);
    const permission = await canEditBlog(getDB(), blogId, session.userId);
    if (!permission.ok) {
      return NextResponse.json(
        { error: permission.notFound ? 'Blog not found' : 'Not authorized' },
        { status: permission.notFound ? 404 : 403 },
      );
    }

    const expiresAt = Math.floor(Date.now() / 1000) + COLLAB_TOKEN_TTL_SECONDS;
    const token = await signSession({
      purpose: 'collab',
      blogId,
      userId: session.userId,
      username: session.profile?.username,
      displayName: session.profile?.display_name,
      exp: expiresAt,
    });

    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    console.error('Collaboration token error:', error);
    return NextResponse.json({ error: 'Failed to authorize collaboration' }, { status: 500 });
  }
}
