export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { hashIP } from '../../../../../lib/blog';

// POST — record a view (deduped per IP per 24h)
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession().catch(() => null);

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const ipHash = await hashIP(ip);
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;

    // Deduplicate: one view per IP per blog per 24h
    const existing = await db.prepare(
      'SELECT 1 FROM blog_views WHERE blog_id = ? AND ip_hash = ? AND created_at > ?'
    ).bind(slugid, ipHash, dayAgo).first();

    if (!existing) {
      // Insert + counter increment atomically in one round-trip (D1 batch = transaction).
      await db.batch([
        db.prepare('INSERT INTO blog_views (blog_id, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?)')
          .bind(slugid, session?.userId || null, ipHash, now),
        db.prepare('UPDATE blogs SET view_count = view_count + 1 WHERE id = ?').bind(slugid),
      ]);

      // Record taste signal (best-effort, off the critical path)
      try { const { recordSignal } = await import('../../../../../lib/taste'); if (session?.userId) await recordSignal(db, session.userId, 'read', { blogId: slugid }); } catch {}

      // Dimensional analytics are best-effort so a pending migration can never
      // break the public view counter.
      try {
        const context = await request.json().catch(() => ({}));
        const { classifyDevice, recordAnalyticsEvent } = await import('../../../../../lib/analytics');
        await recordAnalyticsEvent(db, {
          blogId: slugid,
          userId: session?.userId,
          ip,
          eventType: 'view',
          referrer: context.referrer,
          utmSource: context.utmSource,
          utmMedium: context.utmMedium,
          utmCampaign: context.utmCampaign,
          deviceCategory: classifyDevice(request.headers.get('user-agent') || ''),
          countryCode: request.headers.get('cf-ipcountry'),
          occurredAt: now,
        });
      } catch (error) {
        console.warn('[analytics/view] event write failed:', error?.message || error);
      }
    }

    const blog = await db.prepare('SELECT view_count FROM blogs WHERE id = ?').bind(slugid).first();
    return NextResponse.json({ views: blog?.view_count || 0 });
  } catch {
    return NextResponse.json({ views: 0 });
  }
}
