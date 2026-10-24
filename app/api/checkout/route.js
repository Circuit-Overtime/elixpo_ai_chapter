export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { pricingForCountry, PLANS } from '../../../lib/pricing';
import { payoutsBase } from '../../../lib/checkout-handoff';

// GET /api/checkout?plan=member
//
// Server-side handoff to Elixpo Pay. We resolve the buyer (session) and their
// region (cf-ipcountry → currency), then ask Elixpo Pay to create a checkout
// session with our secret key. Elixpo Pay resolves the PRICE from its own
// catalog — we no longer sign an amount, so there's nothing to tamper with and
// no shared handoff secret to distribute.
export async function GET(request) {
  const url = new URL(request.url);
  const plan = (url.searchParams.get('plan') || '').toLowerCase();

  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  if (!plan || plan === 'free') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  // Block plans that aren't purchasable yet (e.g. Team) — UI hides them, but
  // guard the route against a hand-crafted ?plan= too.
  if (PLANS.find((p) => p.id === plan)?.comingSoon) {
    return NextResponse.redirect(new URL('/pricing?error=coming_soon', request.url));
  }

  // Region → currency (same source the pricing page uses). Elixpo Pay picks the
  // matching catalog price for this currency.
  let cc = request.headers.get('cf-ipcountry') || '';
  if (!cc) {
    try { cc = request.cf?.country || ''; } catch {}
  }
  const pricing = pricingForCountry(cc);
  if (!pricing.prices?.[plan]) {
    return NextResponse.redirect(new URL('/pricing?error=unknown_plan', request.url));
  }

  const apiKey = process.env.ELIXPO_PAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'billing_unconfigured', error_description: 'ELIXPO_PAY_API_KEY not set' },
      { status: 500 },
    );
  }

  let created;
  try {
    const res = await fetch(`${payoutsBase()}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tier: plan,
        currency: pricing.currency,
        customer: {
          uid: session.userId,
          email: session.profile?.email || session.email || undefined,
        },
        success_url: `${url.origin}/settings`,
      }),
    });
    created = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[checkout] payouts error', res.status, created);
      return NextResponse.redirect(new URL('/pricing?error=checkout_failed', request.url));
    }
  } catch (err) {
    console.error('[checkout] payouts unreachable', err);
    return NextResponse.redirect(new URL('/pricing?error=checkout_unreachable', request.url));
  }

  if (!created?.url) {
    return NextResponse.redirect(new URL('/pricing?error=checkout_failed', request.url));
  }
  return NextResponse.redirect(created.url);
}
