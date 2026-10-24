export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// POST — keep editing lock alive
// Body: { blogId }
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { blogId } = await request.json();
  if (!blogId) return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    // Only refresh if this user holds the lock
    const result = await db.prepare(
      'UPDATE blogs SET editing_since = ? WHERE id = ? AND editing_by = ?'
    ).bind(now, blogId, session.userId).run();

    if (result.meta?.changes === 0) {
      return NextResponse.json({ active: false, message: 'Lock not held by you' });
    }

    return NextResponse.json({ active: true });
  } catch {
    return NextResponse.json({ active: false });
  }
}
