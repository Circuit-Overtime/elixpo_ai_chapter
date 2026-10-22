export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { classifyDevice, recordAnalyticsEvent } from '../../../../lib/analytics';

const PUBLIC_EVENTS = new Set(['impression', 'read_progress', 'read_complete', 'share']);

export async function POST(request) {
  try {
    const body = await request.json();
    const blogId = typeof body.blogId === 'string' ? body.blogId : '';
    const eventType = typeof body.eventType === 'string' ? body.eventType : '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(blogId) || !PUBLIC_EVENTS.has(eventType)) {
      return NextResponse.json({ error: 'Invalid analytics event' }, { status: 400 });
    }

    const session = await getSession().catch(() => null);
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const blog = await db.prepare("SELECT 1 FROM blogs WHERE id = ? AND status = 'published'").bind(blogId).first();
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });

    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const numericValue = Number(body.value);
    const value = eventType === 'read_progress'
      ? Math.max(0, Math.min(1, Number.isFinite(numericValue) ? numericValue : 0))
      : eventType === 'read_complete'
        ? Math.max(0, Math.min(86400, Number.isFinite(numericValue) ? numericValue : 0))
        : null;
    await recordAnalyticsEvent(db, {
      blogId,
      userId: session?.userId,
      ip,
      eventType,
      value,
      referrer: body.referrer,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign,
      deviceCategory: classifyDevice(request.headers.get('user-agent') || ''),
      countryCode: request.headers.get('cf-ipcountry'),
      occurredAt: now,
      // Shares are intentional actions and should not be deduped across methods.
      bucket: eventType === 'share' ? `${Math.floor(now / 60)}:${body.method || 'unknown'}` : Math.floor(now / 86400),
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Could not record analytics event' }, { status: 500 });
  }
}
