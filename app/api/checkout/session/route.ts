export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { verifyHandoff } from "@/lib/handoff";
import { isPlatformMerchant, PLATFORM_COMMISSION_BPS } from "@/lib/merchant";
// ensureProviderCustomer kept available in @/lib/customers for future use
// once accounts.elixpo collects phone numbers — see the comment in the
// recurring-checkout branch below.
import { ensurePlanForPrice } from "@/lib/plans";
import { razorpayFromEnv } from "@/lib/providers/razorpay";
import {
    createCheckoutSession,
    getAppBySlug,
    getCheckoutSession,
    getPriceById,
    resolveProductAndPrice,
    setSessionOrder,
    setSessionSubscription,
    upsertCustomer,
    upsertRecurringSubscription,
} from "@/lib/repo";

/**
 * POST /api/checkout/session
 *
 * Called by the hosted /checkout page to hydrate the order. The session is
 * created ahead of time by the consuming app via POST /v1/checkout/sessions, so
 * the page passes back only the opaque session id:
 *
 *   Body: { session_id: "cs_…" }
 *
 * We load the session, resolve its product/price, lazily create the Razorpay
 * order (close to payment, so abandoned sessions never mint orders), and return
 * what Razorpay Checkout needs.
 *
 * Legacy: { token } is still accepted while older callers migrate off the
 * signed-handoff flow — it verifies the token, materialises a session, then
 * finalises it the same way. Remove once no caller sends `token`.
 */
export async function POST(request: NextRequest) {
    try {
        const body: any = await request.json().catch(() => ({}));
        const db = await getDatabase();

        let sessionId: string | undefined = body.session_id;

        // ── Legacy handoff-token path ───────────────────────────────────────
        if (!sessionId && body.token) {
            const legacy = await materialiseFromToken(db, body.token);
            if (legacy instanceof NextResponse) return legacy;
            sessionId = legacy;
        }

        if (!sessionId) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "session_id is required",
                },
                { status: 400 },
            );
        }

        const session = (await getCheckoutSession(db, sessionId)) as any;
        if (!session) {
            return NextResponse.json(
                {
                    error: "unknown_session",
                    error_description: "No such checkout session",
                },
                { status: 404 },
            );
        }
        if (session.status === "completed") {
            return NextResponse.json(
                {
                    error: "session_completed",
                    error_description: "This checkout is already paid.",
                },
                { status: 409 },
            );
        }
        if (
            session.expires_at &&
            new Date(`${session.expires_at.replace(" ", "T")}Z`) < new Date()
        ) {
            return NextResponse.json(
                {
                    error: "session_expired",
                    error_description: "This checkout link has expired.",
                },
                { status: 410 },
            );
        }

        return await finalizeSession(db, session);
    } catch (err: any) {
        console.error("[checkout/session] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}

/**
 * Build the order details for a session, lazily creating the Razorpay order,
 * and return the JSON the hosted checkout page consumes.
 */
async function finalizeSession(
    db: D1Database,
    session: any,
): Promise<NextResponse> {
    const app = (await db
        .prepare(
            "SELECT id, slug, name, return_url, merchant_id FROM apps WHERE id = ?",
        )
        .bind(session.app_id)
        .first()) as any;

    const product = session.product_id
        ? ((await db
              .prepare("SELECT name, tier FROM products WHERE id = ?")
              .bind(session.product_id)
              .first()) as any)
        : null;
    const price = session.price_id
        ? ((await db
              .prepare(
                  "SELECT interval, interval_count FROM prices WHERE id = ?",
              )
              .bind(session.price_id)
              .first()) as any)
        : null;
    const customer = session.customer_id
        ? ((await db
              .prepare("SELECT email FROM customers WHERE id = ?")
              .bind(session.customer_id)
              .first()) as any)
        : null;

    const meta = parseMeta(session.metadata);

    const details = {
        amount: session.amount,
        currency: session.currency,
        product_name: product?.name ?? "Membership",
        tier: product?.tier ?? meta.plan ?? "member",
        app: app?.slug,
        app_name: app?.name,
        interval: price?.interval ?? "month",
        interval_count: price?.interval_count ?? 1,
        prefill: { email: customer?.email ?? "" },
        return_url: session.return_url ?? app?.return_url ?? null,
    };

    const razorpay = await razorpayFromEnv(getEnv);
    if (!razorpay) {
        // Test payment mode: outside production, complete without a real provider
        // so the full session -> grant -> entitlement loop can be exercised before
        // Razorpay/Stripe bank accounts are connected.
        const environment = await getEnv("ENVIRONMENT");
        if (environment !== "production") {
            return NextResponse.json({
                session_id: session.id,
                provider: "test",
                test_mode: true,
                ...details,
            });
        }
        return NextResponse.json(
            {
                error: "provider_unconfigured",
                error_description:
                    "Razorpay keys are not set on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
            },
            { status: 503 },
        );
    }

    // ── Recurring (autopay) path ────────────────────────────────────────
    // If the bound price is type='recurring', we mint a Razorpay
    // Subscription instead of a one-time Order. The buyer gets redirected
    // to Razorpay's hosted mandate-collection page (short_url) — we don't
    // open the Checkout JS modal for these.
    const priceRow = session.price_id
        ? await getPriceById(db, session.price_id)
        : null;
    if (priceRow?.type === "recurring") {
        let subscriptionId: string | undefined =
            session.provider_subscription_id || undefined;
        let shortUrl: string | undefined;

        if (!subscriptionId) {
            // Lazy-create the upstream Plan if this is the first checkout
            // for this price. Subsequent checkouts reuse the cached id.
            const { providerPlanId } = await ensurePlanForPrice({
                db,
                provider: razorpay,
                priceId: priceRow.id,
            });

            // Provider-customer binding is INTENTIONALLY disabled in v1.
            //
            // Background: Razorpay's hosted mandate page (rzp.io) won't
            // compute start_at / end_at / charge_at when the bound
            // customer is missing `contact` (Indian eMandate + UPI
            // Autopay both require a phone number per RBI rules).
            // Without a schedule the page renders "Hosted page is not
            // available". accounts.elixpo doesn't collect phone numbers
            // today, so binding a half-filled customer hurts more than
            // it helps — Razorpay's own page collects contact + mandate
            // in one go if no customer is bound.
            //
            // The customer record is still maintained in our DB and
            // ready to bind once we add phone collection (then re-enable
            // the line below and remove this comment).
            //
            // const { providerCustomerId } = await ensureProviderCustomer(
            //     db, razorpay, session.customer_id,
            // );

            // Razorpay requires a finite total_count. RBI caps UPI
            // Autopay + eMandate mandates at 30 years from creation, so
            // 360 monthly cycles is the practical universal max
            // (anything higher fails with "expire_at cannot be more
            // than 30 years for upi"). Plenty for a SaaS subscription;
            // buyers who run through 30 years of renewals can re-mint.
            // RazorpayProvider.safeTotalCount() also clamps defensively.
            const sub = await razorpay.createSubscription({
                providerPlanId,
                // providerCustomerId intentionally omitted — see comment
                // above about the contact-required schedule computation
                // on Razorpay's hosted page.
                totalCount: 360,
                notifyEmail: false,
                notes: {
                    session_id: session.id,
                    app: app?.slug ?? "",
                    uid: session.external_uid,
                    tier: details.tier,
                },
            });
            subscriptionId = sub.providerSubscriptionId;
            shortUrl = sub.shortUrl;
            await setSessionSubscription(db, session.id, subscriptionId);

            // Stub a 'pending' subscription row so the webhook handler
            // has something to update on subscription.activated rather
            // than creating-with-incomplete-context from inside the
            // webhook. Also lets the dashboard show "pending mandate"
            // immediately.
            await upsertRecurringSubscription(db, {
                appId: session.app_id,
                customerId: session.customer_id,
                productId: session.product_id,
                priceId: session.price_id,
                tier: details.tier,
                providerSubscriptionId: subscriptionId,
                status: "pending",
            });
        } else {
            // Reload path — the buyer hit this checkout session before
            // (page refresh, browser back, etc.). Fetch the live
            // subscription from Razorpay to get the canonical short_url;
            // do NOT construct a URL from the sub_id by string concat
            // (Razorpay's short URL uses a different id namespace).
            //
            // If the sub is already past the mandate stage (active/
            // cancelled/completed), the rzp.io hosted page returns
            // "Hosted page is not available" — that's expected. We
            // surface the URL anyway; the buyer's browser will land on
            // the success page (via Razorpay's own redirect) once they
            // visit a still-valid sub.
            try {
                const live = await razorpay.getSubscription(subscriptionId);
                shortUrl = live.shortUrl ?? undefined;
            } catch (err) {
                console.error(
                    "[checkout/session] getSubscription failed: %s",
                    err instanceof Error ? err.message : String(err),
                );
            }
            if (!shortUrl) {
                // Fallback: if Razorpay can't return a URL (e.g. sub is
                // in a non-mandate state), send the buyer to the
                // app-side success/return URL instead of a broken page.
                // `details` already carries return_url — spread first so
                // our explicit fields win without TS duplicate-key warnings.
                return NextResponse.json({
                    ...details,
                    session_id: session.id,
                    provider: "razorpay",
                    mode: razorpay.mode,
                    billing_mode: "autopay",
                    subscription_id: subscriptionId,
                    short_url: null,
                    finished: true,
                });
            }
        }

        return NextResponse.json({
            session_id: session.id,
            provider: "razorpay",
            mode: razorpay.mode,
            billing_mode: "autopay",
            subscription_id: subscriptionId,
            // Hosted mandate collection — the client redirects the
            // browser here instead of opening Checkout JS.
            short_url: shortUrl,
            ...details,
        });
    }

    // ── One-time (Order) path — unchanged behaviour ─────────────────────
    // Reuse the order if this session already minted one (page reload / retry).
    let orderId: string | undefined = session.provider_order_id || undefined;
    if (!orderId) {
        // Razorpay Route: if the app's merchant has a connected, active payout
        // account, split the payment to their linked account (minus the platform
        // commission). Otherwise funds settle to the platform account as before.
        const transfers = await routeTransfers(
            db,
            app?.merchant_id,
            session.amount,
            session.currency,
            app?.slug,
        );
        const base = {
            amount: session.amount,
            currency: session.currency,
            receipt: session.id,
            notes: {
                app: app?.slug,
                uid: session.external_uid,
                tier: details.tier,
            },
        };
        let order: { providerOrderId: string };
        try {
            order = await razorpay.createOrder(
                transfers ? { ...base, transfers } : base,
            );
        } catch (err) {
            // A bad/inactive Route account must never break checkout — fall back
            // to a normal order (funds settle to the platform) and log it.
            if (!transfers) throw err;
            console.error(
                `[checkout/session] Route transfer rejected for merchant ${app?.merchant_id}; falling back to platform settle:`,
                err,
            );
            order = await razorpay.createOrder(base);
        }
        orderId = order.providerOrderId;
        await setSessionOrder(db, session.id, orderId);
    }

    return NextResponse.json({
        session_id: session.id,
        provider: "razorpay",
        mode: razorpay.mode,
        billing_mode: "one_time",
        key_id: razorpay.keyId,
        order_id: orderId,
        ...details,
    });
}

/**
 * Legacy: verify a signed handoff token and materialise a checkout session from
 * it, returning the new session id. Mirrors the pre-API flow.
 */
async function materialiseFromToken(
    db: D1Database,
    token: string,
): Promise<string | NextResponse> {
    const secret = await getEnv("ELIXPO_PAY_HANDOFF_SECRET");
    if (!secret) {
        return NextResponse.json(
            {
                error: "legacy_disabled",
                error_description: "Handoff tokens are no longer accepted.",
            },
            { status: 410 },
        );
    }
    const result = await verifyHandoff(secret, token);
    if (!result.ok) {
        return NextResponse.json(
            { error: "invalid_token", error_description: result.error },
            { status: 401 },
        );
    }
    const p = result.payload;

    const app = await getAppBySlug(db, p.app);
    if (!app) {
        return NextResponse.json(
            { error: "unknown_app", error_description: `No app '${p.app}'` },
            { status: 404 },
        );
    }

    const resolved = await resolveProductAndPrice(
        db,
        app.id,
        p.plan,
        p.currency,
    );
    if (!resolved) {
        return NextResponse.json(
            {
                error: "unknown_plan",
                error_description: `No product for tier '${p.plan}'`,
            },
            { status: 404 },
        );
    }

    const customerId = await upsertCustomer(db, app.id, p.uid, p.email);
    return createCheckoutSession(db, {
        appId: app.id,
        customerId,
        externalUid: p.uid,
        productId: resolved.product.id,
        priceId: resolved.price?.id ?? null,
        currency: p.currency,
        amount: p.amount,
        returnUrl: p.return ?? app.return_url,
        metadata: { plan: p.plan, source: "handoff" },
    });
}

function parseMeta(raw: unknown): Record<string, any> {
    if (!raw || typeof raw !== "string") return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * Build the Razorpay Route `transfers` for an order when the app's merchant has
 * a connected, active payout account. Splits `amount` to their linked account,
 * holding back the platform commission. Returns undefined when there's no active
 * account (→ funds settle to the platform account, unchanged behaviour).
 */
async function routeTransfers(
    db: D1Database,
    merchantId: string | undefined,
    amount: number,
    currency: string,
    appSlug: string | undefined,
): Promise<Array<Record<string, unknown>> | undefined> {
    // The platform owner's products settle directly to the platform account —
    // never split them.
    if (!merchantId || isPlatformMerchant(merchantId)) return undefined;
    const pa = (await db
        .prepare(
            `SELECT razorpay_account_id
             FROM payout_accounts
             WHERE merchant_id = ? AND status = 'active'
               AND razorpay_account_id IS NOT NULL`,
        )
        .bind(merchantId)
        .first()) as { razorpay_account_id: string } | null;
    if (!pa?.razorpay_account_id) return undefined;

    // Platform commission is set by us (hardcoded), never by the merchant.
    const commission = Math.round((amount * PLATFORM_COMMISSION_BPS) / 10000);
    const transferAmount = amount - commission;
    if (transferAmount <= 0) return undefined; // commission ≥ amount → keep it all

    return [
        {
            account: pa.razorpay_account_id,
            amount: transferAmount,
            currency,
            notes: appSlug ? { app: appSlug } : {},
        },
    ];
}
