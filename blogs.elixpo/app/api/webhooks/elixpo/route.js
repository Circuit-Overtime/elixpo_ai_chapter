export const runtime = 'edge';

import { NextResponse } from 'next/server';

const MAX_SKEW_SECONDS = 5 * 60;

// App-scoped webhook receiver for accounts.elixpo user.updated deliveries.
export async function POST(request) {
  const secret = process.env.ACCOUNTS_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[accounts-webhook] ACCOUNTS_APP_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const raw = await request.text();
  const event = request.headers.get('x-elixpo-event') || '';
  const eventId = request.headers.get('x-elixpo-event-id') || '';
  const timestamp = Number(request.headers.get('x-elixpo-timestamp'));
  const signature = (request.headers.get('x-elixpo-signature') || '').replace(/^sha256=/, '');
  const now = Math.floor(Date.now() / 1000);

  if (!eventId || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) {
    return NextResponse.json({ error: 'Stale or incomplete webhook' }, { status: 401 });
  }

  const { verifyHmacHex } = await import('../../../../lib/hmac');
  if (!(await verifyHmacHex(`${timestamp}.${raw}`, signature, secret))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (event !== 'user.updated') {
    return NextResponse.json({ ok: true, ignored: event });
  }

  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const userId = body.elixpo_id || body.user_id || body.userId || body.sub || body.id;
  if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { syncAccountProfile } = await import('../../../../lib/accountProfileSync');
    const db = getDB();

    const duplicate = await db.prepare('SELECT 1 FROM account_webhook_events WHERE id = ?')
      .bind(eventId).first();
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true });

    const data = body.data || {};
    const result = await syncAccountProfile(db, {
      userId: String(userId),
      ...(data.username !== undefined ? { username: data.username } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.display_name !== undefined ? { displayName: data.display_name } : {}),
      ...(data.avatar_url !== undefined ? { avatarUrl: data.avatar_url } : {}),
    });
    await db.prepare(`
      INSERT OR IGNORE INTO account_webhook_events (id, event_type, user_id, created_at)
      VALUES (?, ?, ?, unixepoch())
    `).bind(eventId, event, String(userId)).run();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[accounts-webhook] Sync failed:', error?.message || error);
    return NextResponse.json({ error: 'Profile sync failed' }, { status: 500 });
  }
}
