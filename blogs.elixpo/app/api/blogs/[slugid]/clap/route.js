export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// GET — clap status
export async function GET(request, { params }) {
  const { slugid } = await params;
  const session = await getSession().catch(() => null);

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const [totalRow, userRow] = await Promise.all([
      db.prepare('SELECT COALESCE(SUM(count), 0) as c FROM claps WHERE blog_id = ?').bind(slugid).first(),
      session?.userId
        ? db.prepare('SELECT count FROM claps WHERE blog_id = ? AND user_id = ?').bind(slugid, session.userId).first()
        : null,
    ]);

    return NextResponse.json({ userClaps: userRow?.count || 0, totalClaps: totalRow?.c || 0 });
  } catch {
    return NextResponse.json({ userClaps: 0, totalClaps: 0 });
  }
}

// POST — add claps (1-50 per user per blog)
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { count = 1 } = await request.json();
  const claps = Math.max(1, Math.min(50, parseInt(count, 10) || 1));

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare(`
      INSERT INTO claps (user_id, blog_id, count, created_at, updated_at)
      VALUES (?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(user_id, blog_id)
      DO UPDATE SET count = MIN(50, claps.count + excluded.count), updated_at = unixepoch()
    `).bind(session.userId, slugid, claps).run();

    // Update denormalized count
    const total = await db.prepare('SELECT COALESCE(SUM(count), 0) as c FROM claps WHERE blog_id = ?').bind(slugid).first();
    await db.prepare('UPDATE blogs SET clap_total = ? WHERE id = ?').bind(total?.c || 0, slugid).run();

    // Record taste signal
    try { const { recordSignal } = await import('../../../../../lib/taste'); await recordSignal(db, session.userId, 'clap', { blogId: slugid }); } catch {}

    const userRow = await db.prepare('SELECT count FROM claps WHERE blog_id = ? AND user_id = ?').bind(slugid, session.userId).first();

    // Invalidate cache
    try { const { kvInvalidate } = await import('../../../../../lib/cache'); await kvInvalidate(`v1:interactions:${slugid}`); } catch {}

    return NextResponse.json({ userClaps: userRow?.count || 0, totalClaps: total?.c || 0 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
