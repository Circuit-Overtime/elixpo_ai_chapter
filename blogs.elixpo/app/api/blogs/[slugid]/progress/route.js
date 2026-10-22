export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { classifyDevice, recordAnalyticsEvent, rotatingVisitorHash } from '../../../../../lib/analytics';

// Retrieve the latest resumable position. Furthest progress remains separate
// because creator analytics must not move backwards.
export async function GET(_request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const row = await db.prepare(
      'SELECT read_progress, resume_progress, read_at FROM read_history WHERE user_id = ? AND blog_id = ?'
    ).bind(session.userId, slugid).first();
    return NextResponse.json({
      found: Boolean(row),
      progress: Number(row?.read_progress || 0),
      resumeProgress: Number(row?.resume_progress || 0),
      readAt: row?.read_at || null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load reading progress' }, { status: 500 });
  }
}

// Preserve furthest progress for analytics while tracking the reader's latest
// position independently for Continue reading.
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { progress, dwellSeconds, resetResume = false } = await request.json();
  const p = Math.max(0, Math.min(1, parseFloat(progress) || 0));
  const resumeProgress = resetResume || p >= 0.9 ? 0 : p;

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare(`
      INSERT INTO read_history (user_id, blog_id, read_at, read_progress, resume_progress)
      VALUES (?, ?, unixepoch(), ?, ?)
      ON CONFLICT(user_id, blog_id)
      DO UPDATE SET
        read_progress = MAX(read_history.read_progress, excluded.read_progress),
        resume_progress = excluded.resume_progress,
        read_at = unixepoch()
    `).bind(session.userId, slugid, p, resumeProgress).run();

    try {
      const now = Math.floor(Date.now() / 1000);
      const visitorHash = await rotatingVisitorHash(null, session.userId, now);
      const progressBucket = Math.min(100, Math.floor(p * 4) * 25);
      if (progressBucket >= 25) {
        await recordAnalyticsEvent(db, {
          blogId: slugid,
          userId: session.userId,
          visitorHash,
          eventType: p >= 0.9 ? 'read_complete' : 'read_progress',
          value: p >= 0.9 ? Math.max(0, Number(dwellSeconds) || 0) : p,
          deviceCategory: classifyDevice(request.headers.get('user-agent') || ''),
          countryCode: request.headers.get('cf-ipcountry'),
          bucket: `${Math.floor(now / 86400)}:${progressBucket}`,
          occurredAt: now,
        });
      }
    } catch (error) {
      console.warn('[analytics/progress] event write failed:', error?.message || error);
    }

    return NextResponse.json({ ok: true, progress: p, resumeProgress });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
