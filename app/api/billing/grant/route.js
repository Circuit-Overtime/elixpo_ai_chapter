export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { verifyHmacHex } from '../../../../lib/hmac';
import { getDB } from '../../../../lib/cloudflare';
import { kvInvalidate } from '../../../../lib/cache';

// POST /api/billing/grant
//
// Inbound webhook from Elixpo Pay (payouts.elixpo.com) after a successful
// purchase. Sets users.tier + tier_expires_at and busts the user cache.
//
// Signature (must match payouts webhooks.ts):
//   X-Elixpo-Pay-Timestamp: <unix seconds>
//   X-Elixpo-Pay-Signature: sha256=<hex HMAC-SHA256(`${ts}.${rawBody}`, ELIXPO_PAY_WEBHOOK_SECRET)>
//
// ELIXPO_PAY_WEBHOOK_SECRET is our PER-APP signing secret (whsec_…), shown in
// the Elixpo Pay dashboard under this product's "Entitlement webhook" — not a
// shared global secret. Roll it there and update this env to match.
export async function POST(request) {
  const secret = process.env.ELIXPO_PAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 500 });
  }

  const raw = await request.text();
  const ts = request.headers.get('x-elixpo-pay-timestamp') || '';

  // Reject stale deliveries (replay window: 5 min).
  const now = Math.floor(Date.now() / 1000);
  if (!ts || Math.abs(now - Number(ts)) > 300) {
    return NextResponse.json({ error: 'stale_timestamp' }, { status: 400 });
  }

  // The signature header may carry several comma-separated values during a
  // secret-rotation grace window (current + previous). Accept if ANY matches.
  const sigs = (request.headers.get('x-elixpo-pay-signature') || '')
    .split(',')
    .map((s) => s.trim().replace(/^sha256=/, ''))
    .filter(Boolean);
  let valid = false;
  for (const sig of sigs) {
    if (await verifyHmacHex(`${ts}.${raw}`, sig, secret)) { valid = true; break; }
  }
  if (!valid) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  if (evt.type !== 'entitlement.updated') {
    return NextResponse.json({ ok: true, ignored: evt.type });
  }
  const d = evt.data || {};
  // Our app id on Elixpo Pay (the slug it signs grants for). Accept the legacy
  // 'lixblogs' too in case an old endpoint is still configured.
  const ourApp = process.env.ELIXPO_PAY_ID || 'lixblogs';
  if ((d.app !== ourApp && d.app !== 'lixblogs') || !d.uid) {
    return NextResponse.json({ ok: true, ignored: 'scope' });
  }

  // Active, non-free entitlement → grant that tier; anything else → free.
  const tier = d.active && d.tier && d.tier !== 'free' ? d.tier : 'free';
  let expiresMs = null;
  if (tier !== 'free' && d.expires_at) {
    const s = String(d.expires_at);
    const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) expiresMs = t;
  }

  try {
    const db = getDB();
    const res = await db
      .prepare('UPDATE users SET tier = ?, tier_expires_at = ? WHERE id = ?')
      .bind(tier, expiresMs, d.uid)
      .run();
    try { await kvInvalidate(`v1:user:${d.uid}`); } catch {}
    return NextResponse.json({ ok: true, tier, changed: res?.meta?.changes ?? 0 });
  } catch (err) {
    console.error('[billing/grant] error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
