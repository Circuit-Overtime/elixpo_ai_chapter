export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

// POST — record a taste signal. Used by "Show less like this" (negative weight)
// so the feed can learn to downrank similar topics.
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ ok: false }, { status: 401 });
  const { blogId = null, tags = [], type = 'show_less', weight = -2 } = await request.json().catch(() => ({}));
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const list = tags.length ? tags : [null];
    for (const t of list) {
      await db.prepare(
        'INSERT INTO user_signals (user_id, signal_type, tag, blog_id, weight) VALUES (?, ?, ?, ?, ?)'
      ).bind(session.userId, type, t, blogId, weight).run();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
