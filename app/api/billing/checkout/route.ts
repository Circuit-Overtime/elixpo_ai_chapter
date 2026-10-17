import { type NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth';
import { getEnv, getOrigin } from '@/lib/db';
import {
  type BillingCurrency,
  type BillingInterval,
  type SellableTier,
} from '@/lib/types';

export const runtime = 'edge';

const PAID_TIERS: SellableTier[] = ['pro', 'business'];
const CURRENCIES: BillingCurrency[] = ['INR', 'USD'];
const INTERVALS: BillingInterval[] = ['monthly', 'annual'];

/**
 * POST /api/billing/checkout
 *
 * Creates an Elixpo Pay hosted-checkout session for a paid tier and returns
 * its URL. The browser redirects there; on payment, Pay fires
 * entitlement.updated → /api/webhooks/pay flips the tier. The buyer never
 * touches card data and we never see it.
 *
 * Body: { tier: 'pro'|'business', currency: 'INR'|'USD', interval: 'monthly'|'annual' }
 * Returns: 200 { url } · 400 bad input · 401 unauth · 502 Pay error · 503 unconfigured
 */
export async function POST(request: NextRequest) {
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const env = getEnv();
  // The API key alone identifies the app to Pay; app id isn't needed in the
  // request body. Only the key gates "configured".
  if (!env.ELIXPO_PAY_API_KEY) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });
  }

  let body: { tier?: string; currency?: string; interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const tier = body.tier as SellableTier;
  const currency = (body.currency || 'INR') as BillingCurrency;
  const interval = (body.interval || 'monthly') as BillingInterval;

  if (!PAID_TIERS.includes(tier) || !CURRENCIES.includes(currency) || !INTERVALS.includes(interval)) {
    return NextResponse.json({ error: 'Unknown plan selection' }, { status: 400 });
  }

  const origin = getOrigin(request.url);
  const base = env.ELIXPO_PAY_BASE_URL.replace(/\/$/, '');

  let res: Response;
  try {
    res = await fetch(`${base}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ELIXPO_PAY_API_KEY}`,
      },
      // Pay resolves the price from tier + currency + interval against the
      // synced catalog. interval maps monthly→month, annual→year.
      body: JSON.stringify({
        tier,
        currency,
        interval: interval === 'monthly' ? 'month' : 'year',
        customer: { uid: user.elixpo_id, email: user.email },
        return_url: `${origin}/dashboard/subscription?upgraded=1`,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach checkout. Try again.' }, { status: 502 });
  }

  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    console.error('[checkout] Pay error', res.status, data);
    return NextResponse.json({ error: data?.error || 'Could not start checkout.' }, { status: 502 });
  }

  return NextResponse.json({ url: data.url });
}
