import { type NextRequest, NextResponse } from 'next/server';
import { getDB, getEnv, getKV } from '@/lib/db';
import { triggerMail } from '@/lib/mails';
import type { BillingStatus, Tier } from '@/lib/types';

export const runtime = 'edge';

/**
 * POST /api/webhooks/pay
 *
 * Inbound webhook from Elixpo Pay. Fired on `entitlement.updated` — first
 * purchase, every autopay renewal, and cancellation/lapse. Flips the user's
 * tier; because getCurrentUser() reads `tier` fresh from D1 each request (KV
 * only caches session→userId), the change takes effect on the next request.
 *
 * ─── Signature (Elixpo Pay scheme — see payouts.elixpo webhooks.ts) ───
 *   X-Elixpo-Pay-Timestamp: <unix_seconds>
 *   X-Elixpo-Pay-Signature: sha256=<hex>[,sha256=<hex>…]   (accept if ANY match)
 *   X-Elixpo-Pay-Event:     entitlement.updated
 *   signed payload = `${timestamp}.${rawBody}`, key = ELIXPO_PAY_WEBHOOK_SECRET.
 *   Comma list carries the current + in-grace previous secret during rotation.
 *
 * ─── Body ────────────────────────────────────────────────────────────
 *   { id, type: "entitlement.updated", created, data: {
 *       app, uid: "<elixpo_id>", tier: "pro"|"business"|…, active: bool,
 *       status, expires_at, provider_subscription_id? } }
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!env.ELIXPO_PAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Pay webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();

  // Replay window
  const tsHeader = request.headers.get('x-elixpo-pay-timestamp') || '';
  if (!/^\d+$/.test(tsHeader)) return reject('missing or invalid timestamp');
  const ts = Number(tsHeader);
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
    return reject('timestamp outside ±5 minute window');
  }

  // Signature — recompute once, accept if any provided sha256= matches.
  const sigHeader = request.headers.get('x-elixpo-pay-signature') || '';
  const expected = await hmacHex(env.ELIXPO_PAY_WEBHOOK_SECRET, `${ts}.${rawBody}`);
  const provided = sigHeader
    .split(',')
    .map((s) => s.trim().replace(/^sha256=/i, '').toLowerCase());
  const ok = provided.some((p) => /^[0-9a-f]{64}$/.test(p) && timingSafeEqual(p, expected));
  if (!ok) return reject('invalid signature');

  let body: PayEvent;
  try {
    body = JSON.parse(rawBody) as PayEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Idempotency — Pay retries on non-2xx. Dedupe on the delivery id.
  const eventId = body.id || request.headers.get('x-elixpo-pay-event-id');
  const kv = getKV();
  if (eventId) {
    if (await kv.get(`wh:pay:${eventId}`)) {
      return NextResponse.json({ ok: true, deduped: true });
    }
    await kv.put(`wh:pay:${eventId}`, '1', { expirationTtl: 1800 }).catch(() => {});
  }

  const data = body.data;
  if (!data?.uid) {
    return NextResponse.json({ error: 'missing data.uid' }, { status: 400 });
  }

  try {
    if (body.type === 'payment.captured') {
      // The only event carrying the amount — drives the receipt email.
      await sendReceiptMail(data).catch((e) => console.error('[webhook:pay] receipt', e));
      return NextResponse.json({ ok: true });
    }
    if (body.type && body.type !== 'entitlement.updated') {
      return NextResponse.json({ ok: true, ignored: body.type });
    }
    await applyEntitlement(data);
    // Lifecycle email — best-effort, never blocks (or fails) the 2xx ack.
    await sendLifecycleMail(data).catch((e) => console.error('[webhook:pay] mail', e));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook:pay] handler error', err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}

// ─── Lifecycle email ────────────────────────────────────────────────

/**
 * Trigger the matching transactional email for this entitlement event:
 *   active + status 'active'    → receipt (grant / renewal)
 *   status 'cancelled'          → cancellation (access continues to expiry)
 *   status 'halted' / failed    → payment failed (mandate broken)
 * No-op if Mails isn't configured or the user has no email on file.
 */
async function sendLifecycleMail(data: EntitlementData): Promise<void> {
  const env = getEnv();
  if (!env.ELIXPO_MAILS_SECRET || !data.uid) return;

  const user = await getDB()
    .prepare('SELECT email, display_name FROM users WHERE elixpo_id = ?')
    .bind(data.uid)
    .first<{ email: string; display_name: string }>();
  if (!user?.email) return;

  const name = user.display_name || 'there';
  const tier = String(data.tier || '');
  const status = (data.status || '').toLowerCase();
  const expiry = formatDate(data.expires_at);
  // Dedupe per entitlement state so a redelivery can't double-send.
  const idem = `${data.uid}:${data.version ?? 0}:${status || (data.active ? 'active' : 'inactive')}`;

  // `halted` splits two ways (per Pay's `failed` flag): a broken card
  // (failed:true → "update your payment") vs a UPI-mandate revoke
  // (failed:false → effectively a cancellation). `cancelled` is always a
  // cancellation. Either way access continues until expires_at.
  const isCancellation =
    status === 'cancelled' ||
    status === 'canceled' ||
    (status === 'halted' && data.failed !== true);
  const isPaymentFailed = status === 'halted' && data.failed === true;

  if (isCancellation) {
    await triggerMail({
      endpointKey: env.ELIXPO_MAILS_HOOK_CANCELED,
      to: user.email,
      variables: { name, tier, access_until: expiry },
      idempotencyKey: idem,
    });
  } else if (isPaymentFailed) {
    await triggerMail({
      endpointKey: env.ELIXPO_MAILS_HOOK_PAYMENT_FAILED,
      to: user.email,
      variables: { name, tier, update_url: 'https://lixrl.com/dashboard/subscription' },
      idempotencyKey: idem,
    });
  } else if (data.active === false) {
    // Final fallback to Free at period end. `tier` here is the plan that
    // just ended. No-ops if no downgrade template is configured.
    await triggerMail({
      endpointKey: env.ELIXPO_MAILS_HOOK_DOWNGRADED,
      to: user.email,
      variables: { name, tier, resubscribe_url: 'https://lixrl.com/pricing' },
      idempotencyKey: idem,
    });
  }
  // Receipt is NOT sent here — entitlement.updated has no amount. It fires
  // from payment.captured via sendReceiptMail().
}

/**
 * Receipt email — fired on payment.captured (first charge + every renewal),
 * the only event carrying the amount. Renewal date comes from the user's
 * stored expiry (set by the entitlement.updated that pairs this payment).
 */
async function sendReceiptMail(data: EntitlementData): Promise<void> {
  const env = getEnv();
  if (!env.ELIXPO_MAILS_SECRET || !env.ELIXPO_MAILS_HOOK_RECEIPT || !data.uid) return;

  const user = await getDB()
    .prepare('SELECT email, display_name, tier_expires_at FROM users WHERE elixpo_id = ?')
    .bind(data.uid)
    .first<{ email: string; display_name: string; tier_expires_at: string | null }>();
  if (!user?.email) return;

  await triggerMail({
    endpointKey: env.ELIXPO_MAILS_HOOK_RECEIPT,
    to: user.email,
    variables: {
      name: user.display_name || 'there',
      tier: String(data.tier || ''),
      amount: formatAmount(data.amount, data.currency),
      next_renewal: formatDate(user.tier_expires_at),
      subscription_url: 'https://lixrl.com/dashboard/subscription',
    },
    // One receipt per payment.
    idempotencyKey: data.transaction_id || `${data.uid}:pay:${data.amount ?? ''}`,
  });
}

/** Minor units → "₹3" / "$15" / "300 EUR". Empty if absent. */
function formatAmount(minor?: number, currency?: string): string {
  if (minor == null || Number.isNaN(Number(minor))) return '';
  const cur = (currency || 'INR').toUpperCase();
  const sym = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : '';
  const major = Number(minor) / 100;
  const num = Number.isInteger(major) ? major.toLocaleString() : major.toFixed(2);
  return sym ? `${sym}${num}` : `${num} ${cur}`;
}

/** "Jul 23, 2026" from Pay's "YYYY-MM-DD HH:MM:SS" (UTC) or a unix seconds value. */
function formatDate(v?: string | number | null): string {
  if (v == null) return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(`${v}`.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ─── Apply the entitlement to our user row ──────────────────────────

const PAID_TIERS = new Set<Tier>(['pro', 'business', 'enterprise']);

async function applyEntitlement(data: EntitlementData): Promise<void> {
  const db = getDB();

  // active + recognized tier → grant it. Otherwise (cancel/lapse/unknown
  // tier) → fall back to free.
  const incomingTier = (data.tier || '').toLowerCase() as Tier;
  const granting = data.active === true && PAID_TIERS.has(incomingTier);

  const tier: Tier = granting ? incomingTier : 'free';
  const status: BillingStatus = granting
    ? billingStatusFor(data.status, data.failed)
    : data.active === false
      ? 'canceled'
      : 'none';
  const expiresAt = granting ? normalizeIso(data.expires_at) : null;
  const subId = data.provider_subscription_id ?? data.subscription_id ?? null;

  await db
    .prepare(
      `UPDATE users
         SET tier = ?, billing_status = ?, tier_expires_at = ?,
             pay_subscription_id = COALESCE(?, pay_subscription_id),
             updated_at = datetime('now')
       WHERE elixpo_id = ?`,
    )
    .bind(tier, status, expiresAt, subId, data.uid)
    .run();

  // D1 remains authoritative for branded routing. A lapse suspends every
  // claimed hostname immediately; a later renewal leaves reactivation as an
  // explicit owner action so a stale claim can never silently come back.
  if (!granting) {
    await db
      .prepare(
        `UPDATE subdomains
         SET status = 'suspended', is_default = 0, revision = revision + 1,
             last_error = 'Paid plan inactive', updated_at = datetime('now')
         WHERE user_id = (SELECT id FROM users WHERE elixpo_id = ?)
           AND status IN ('pending', 'verified', 'active', 'failed')`,
      )
      .bind(data.uid)
      .run();
  }
}

function billingStatusFor(s?: string, failed?: boolean): BillingStatus {
  switch ((s || '').toLowerCase()) {
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'halted':
      // Card failure → recoverable (past_due); UPI revoke → effectively canceled.
      return failed ? 'past_due' : 'canceled';
    case 'past_due':
    case 'pending':
      return 'past_due';
    default:
      return 'active';
  }
}

/** Coerce Pay's timestamp to a Z-suffixed ISO string for safe comparison. */
function normalizeIso(v?: string | number | null): string | null {
  if (v == null) return null;
  // Pay emits "YYYY-MM-DD HH:MM:SS" (UTC) — make it ISO so Date.parse is unambiguous.
  const s = typeof v === 'number' ? new Date(v * 1000) : new Date(`${v}`.replace(' ', 'T') + 'Z');
  return Number.isNaN(s.getTime()) ? null : s.toISOString();
}

// ─── Types ──────────────────────────────────────────────────────────

interface EntitlementData {
  app?: string;
  uid?: string;
  tier?: string;
  active?: boolean;
  status?: string;
  failed?: boolean;
  version?: number;
  expires_at?: string | number;
  provider_subscription_id?: string;
  subscription_id?: string;
  // payment.captured fields (amount-bearing event → receipt).
  amount?: number;
  currency?: string;
  transaction_id?: string;
}

interface PayEvent {
  id?: string;
  type?: string;
  created?: number;
  data?: EntitlementData;
}

// ─── HMAC helpers ───────────────────────────────────────────────────

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function reject(reason: string): NextResponse {
  console.warn(`[webhook:pay] reject — ${reason}`);
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
