export const runtime = 'edge';
import { NextResponse } from 'next/server';

// Inbound webhook from accounts.elixpo (the identity source of truth).
//
// Fired when a user revokes the "blogs" app or deletes their account on
// accounts.elixpo. We verify the signature, then hard-purge the user and all
// their data from blogs.elixpo. See GitHub issue #8.
//
// Contract (matches accounts.elixpo webhook delivery):
//   POST /api/webhooks/account-revoked
//   Headers: X-Webhook-Signature: hex(HMAC-SHA256(rawBody, ACCOUNTS_WEBHOOK_SECRET))
//            X-Webhook-Event:     'user.deleted' | 'app.revoked'
//            X-Webhook-Timestamp: ISO-8601
//   Body:    { user_id: "<accounts user id>", client_id?, ... }
//
// accounts.elixpo user id === blogs.elixpo users.id (identity is shared).

const ACCEPTED_EVENTS = new Set(['user.deleted', 'app.revoked', 'user.revoked']);
const MAX_SKEW_MS = 5 * 60 * 1000; // 5-minute replay window

export async function POST(request) {
  const secret = process.env.ACCOUNTS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[account-revoked] ACCOUNTS_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-webhook-signature');
  const event = request.headers.get('x-webhook-event') || '';
  const tsHeader = request.headers.get('x-webhook-timestamp');

  // Replay protection — reject stale/absent timestamps.
  const ts = tsHeader ? Date.parse(tsHeader) : NaN;
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: 'Stale or missing timestamp' }, { status: 401 });
  }

  const { verifyHmacHex } = await import('../../../../lib/hmac');
  const ok = await verifyHmacHex(raw, signature, secret);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (!ACCEPTED_EVENTS.has(event)) {
    // Acknowledge unknown events so accounts doesn't retry them forever.
    return NextResponse.json({ ok: true, ignored: event }, { status: 200 });
  }

  let body;
  try { body = JSON.parse(raw); } catch { body = {}; }
  const userId = body.user_id || body.userId || body.sub || body.id || body.data?.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { purgeUser } = await import('../../../../lib/purgeUser');
    const db = getDB();
    const summary = await purgeUser(db, String(userId));
    console.log('[account-revoked] purge complete', JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    // Non-2xx tells accounts.elixpo to retry (purge is idempotent).
    console.error('[account-revoked] purge failed:', e?.message || e);
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
}
