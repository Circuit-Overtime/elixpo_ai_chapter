export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { fulfillPayment } from "@/lib/fulfill";
import { razorpayFromEnv } from "@/lib/providers/razorpay";
import {
    getCheckoutSessionByOrder,
    getCheckoutSessionBySubscription,
    getSubscriptionByProviderId,
    recordProviderEvent,
    upsertRecurringSubscription,
} from "@/lib/repo";

/**
 * POST /api/webhooks/razorpay
 *
 * Authoritative fulfillment. Verifies X-Razorpay-Signature over the RAW body,
 * de-dups on the provider event id, and fulfills `payment.captured`. Always
 * returns 200 on signature-valid events so Razorpay stops retrying — internal
 * errors are logged, not surfaced as retriable.
 */
export async function POST(request: NextRequest) {
    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return NextResponse.json({ error: "bad_body" }, { status: 400 });
    }

    const signature = request.headers.get("x-razorpay-signature") || "";

    const razorpay = await razorpayFromEnv(getEnv);
    if (!razorpay) {
        console.error("[webhook/razorpay] provider unconfigured");
        return NextResponse.json(
            { error: "provider_unconfigured" },
            { status: 503 },
        );
    }

    const valid = await razorpay.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
        return NextResponse.json(
            { error: "invalid_signature" },
            { status: 401 },
        );
    }

    let event: any;
    try {
        event = razorpay.parseWebhook(rawBody, request.headers);
    } catch (err) {
        console.error("[webhook/razorpay] parse error:", err);
        return NextResponse.json({ ok: true, ignored: "parse_error" });
    }

    try {
        const db = await getDatabase();

        // Replay guard.
        const seen = await recordProviderEvent(
            db,
            "razorpay",
            event.eventId,
            event.type,
            rawBody,
        );
        if (seen.alreadySeen) {
            return NextResponse.json({ ok: true, duplicate: true });
        }

        // ── Subscription lifecycle events ────────────────────────────
        // Note: subscription.charged ALSO has isPaymentCaptured=true
        // (it carries a payment.entity), so we handle it first to ensure
        // the recurring-fulfillment path runs — extending entitlement,
        // writing a ledger row, and firing the outbound webhook for each
        // renewal charge, not just the first one.
        if (event.providerSubscriptionId) {
            const subResult = await handleSubscriptionEvent(db, event);
            if (subResult) return subResult;
        }

        if (!event.isPaymentCaptured) {
            return NextResponse.json({ ok: true, ignored: event.type });
        }

        // Resolve the checkout session this charge belongs to.
        //
        // Two routes here:
        //   - One-time orders: session is bound to provider_order_id.
        //   - Autopay subscriptions (subscription.charged): session is
        //     bound to provider_subscription_id; there is NO order id on
        //     our side (Razorpay creates orders internally per cycle but
        //     we don't track them per-session).
        //
        // Prefer the subscription lookup when the event carries a sub id,
        // otherwise fall back to the order id. Without this branching,
        // recurring renewals returned "no_session" forever and the
        // entitlement was never extended.
        let session: any = null;
        if (event.providerSubscriptionId) {
            session = await getCheckoutSessionBySubscription(
                db,
                event.providerSubscriptionId,
            );
        }
        if (!session && event.providerOrderId) {
            session = await getCheckoutSessionByOrder(
                db,
                event.providerOrderId,
            );
        }
        if (!session) {
            console.warn(
                "[webhook/razorpay] no session for sub=%s order=%s",
                event.providerSubscriptionId ?? "—",
                event.providerOrderId ?? "—",
            );
            return NextResponse.json({ ok: true, ignored: "no_session" });
        }

        const appSlug = (await db
            .prepare("SELECT slug FROM apps WHERE id = ?")
            .bind(session.app_id)
            .first()) as { slug: string } | null;

        await fulfillPayment(db, {
            session,
            appSlug: appSlug?.slug ?? "",
            providerOrderId: event.providerOrderId,
            providerPaymentId: event.providerPaymentId ?? "",
            amount: event.amount ?? session.amount,
            currency: event.currency ?? session.currency,
            raw: event.raw,
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        // Signature was valid; swallow internal errors so Razorpay doesn't
        // hammer retries. Surfaced in logs / delivery records for replay.
        console.error("[webhook/razorpay] fulfillment error:", err);
        return NextResponse.json({ ok: true, deferred: true });
    }
}

/**
 * Handle subscription.* events. Returns a NextResponse to short-circuit the
 * main handler when this event is purely a sub lifecycle event (no payment).
 * Returns null when the event ALSO carries a payment.captured (i.e.
 * subscription.charged) so the main handler can run `fulfillPayment` to
 * extend the entitlement, write a ledger row, and fire outbound webhooks.
 *
 * Event semantics (Razorpay):
 *  - subscription.activated  → first mandate accepted. The actual charge
 *                              arrives separately as subscription.charged
 *                              (or payment.captured carrying subscription_id).
 *  - subscription.charged    → recurring charge succeeded. Falls through to
 *                              fulfillPayment which is idempotent + extends
 *                              the period.
 *  - subscription.paused     → mandate paused. Existing entitlement keeps
 *                              its current period; no further charges
 *                              until resumed.
 *  - subscription.cancelled  → buyer/merchant cancelled. Entitlement is
 *                              left in place until period_end (graceful)
 *                              and the cron expiry takes over.
 *  - subscription.halted     → too many failures; buyer needs to update
 *                              payment method. Entitlement stays active
 *                              through the period they paid for.
 *  - subscription.completed  → ran through `total_count` cycles. Same
 *                              graceful expiry as cancelled.
 */
async function handleSubscriptionEvent(
    db: D1Database,
    event: any,
): Promise<NextResponse | null> {
    const providerSubId = event.providerSubscriptionId as string;
    const status = event.subscriptionStatus as string | null;

    // Resolve the subscription row + the session (for tier/app context).
    const subRow = await getSubscriptionByProviderId(db, providerSubId);
    const session = await getCheckoutSessionBySubscription(db, providerSubId);

    // Update DB status for non-charge events. `charged` falls through to
    // the main fulfillment path which writes status='active' via the
    // upsert in fulfillPayment.
    if (status && status !== "charged") {
        const dbStatus = mapSubStatus(status);
        if (subRow) {
            await db
                .prepare(
                    `UPDATE subscriptions
                     SET status = ?,
                         cancel_at = CASE WHEN ? IN ('cancelled','completed') THEN datetime('now') ELSE cancel_at END,
                         updated_at = datetime('now')
                     WHERE id = ?`,
                )
                .bind(dbStatus, dbStatus, subRow.id)
                .run();
        }
    }

    // subscription.activated arrives with no payment.entity. The first
    // charge comes as a separate subscription.charged / payment.captured
    // event, so there's nothing to fulfill here — just acknowledge.
    if (status === "activated") {
        // Idempotent: subscription row may already be 'pending' from the
        // checkout-session creation. Flip it to 'active' but don't roll
        // the period until the charged event.
        if (session) {
            await upsertRecurringSubscription(db, {
                appId: session.app_id,
                customerId: session.customer_id,
                productId: session.product_id,
                priceId: session.price_id,
                tier: deriveTier(session),
                providerSubscriptionId: providerSubId,
                status: "active",
            });
        }
        return NextResponse.json({ ok: true, subscription: "activated" });
    }

    // Charge → defer to main handler. It calls fulfillPayment which
    // upserts the subscription, extends entitlement, writes ledger, fires
    // outbound webhooks. Returning null lets that path run.
    if (status === "charged") {
        return null;
    }

    // Non-charge non-activated event (paused/cancelled/halted/completed).
    // Status already updated above. We also need to tell the consuming
    // app that the subscription is winding down so it can email the
    // buyer + start the graceful-downgrade UX.
    //
    // For 'cancelled': the entitlement stays ACTIVE until current_period_end
    // (Razorpay was called with cancel_at_cycle_end=true). We fire
    // entitlement.updated with active=true + the existing expires_at +
    // a `cancelled=true` flag so the consumer can render "ends on X"
    // and send the cancellation email immediately.
    //
    // For 'halted': payment failed too many times. Entitlement still
    // active through period_end but the buyer needs to fix their card —
    // we send a `failed=true` flag.
    if (status === "cancelled" || status === "halted") {
        await fireGracefulCancelWebhook(db, providerSubId, status);
    }

    return NextResponse.json({
        ok: true,
        subscription: status ?? "unknown",
    });
}

/**
 * Fire entitlement.updated to the consuming app on subscription wind-down
 * (cancelled / halted). Uses the existing webhook plumbing — same envelope
 * shape, same HMAC signing — so consumers only need to subscribe to one
 * event type.
 */
async function fireGracefulCancelWebhook(
    db: D1Database,
    providerSubId: string,
    status: "cancelled" | "halted",
): Promise<void> {
    const sub = (await db
        .prepare(
            `SELECT s.id, s.app_id, s.tier, s.current_period_end, s.cancel_at,
                    c.external_uid, a.slug AS app_slug
             FROM subscriptions s
             JOIN customers c ON c.id = s.customer_id
             JOIN apps a ON a.id = s.app_id
             WHERE s.provider_subscription_id = ?`,
        )
        .bind(providerSubId)
        .first()) as
        | {
              id: string;
              app_id: string;
              tier: string;
              current_period_end: string | null;
              cancel_at: string | null;
              external_uid: string;
              app_slug: string;
          }
        | null;
    if (!sub) return;

    // Dedup: if this is the `subscription.cancelled` webhook arriving at
    // period_end for a buyer-initiated cancel we already notified about
    // inline (from /v1/subscriptions/cancel), the local row's cancel_at
    // is set. Skip the outbound — the consuming app already sent the
    // cancellation email when the buyer clicked Cancel. Halt events
    // (charge failures) still fire because they're a different signal.
    if (status === "cancelled" && sub.cancel_at) {
        console.log(
            "[webhook/razorpay] skipping cancellation outbound for sub=%s — already notified inline at %s",
            providerSubId,
            sub.cancel_at,
        );
        return;
    }

    const { getWebhookEndpoint } = await import("@/lib/repo");
    const endpoint = await getWebhookEndpoint(db, sub.app_id);
    if (!endpoint) return;

    // For halted events, distinguish UPI-mandate-revocation from
    // exhausted-card-retries by looking at recent payment.failed
    // events for the same subscription. Razorpay's webhook stream:
    //   - Card declined: fires `payment.failed` (often multiple) BEFORE
    //     the eventual `subscription.halted` once retries are exhausted.
    //   - UPI mandate revoked from buyer's GPay/PhonePe app: bank
    //     pushes mandate revocation to NPCI → Razorpay halts the sub
    //     without any payment.failed (no charge was attempted because
    //     the mandate itself is gone).
    // We check provider_webhook_events for any payment.failed in the
    // last 7 days mentioning this sub_id; if present we treat it as
    // a charge failure (failed=true → consumer sends "update your card"
    // mail), otherwise UPI revoke (failed=false → consumer sends a
    // cancellation confirmation mail).
    let failed = false;
    if (status === "halted") {
        const recentFail = (await db
            .prepare(
                `SELECT id FROM provider_webhook_events
                 WHERE provider = 'razorpay'
                   AND event_type = 'payment.failed'
                   AND payload LIKE ?
                   AND datetime(created_at) > datetime('now', '-7 days')
                 LIMIT 1`,
            )
            .bind(`%${providerSubId}%`)
            .first()) as { id: string } | null;
        failed = !!recentFail;
    }

    const { fireEntitlementUpdated } = await import("@/lib/webhooks");
    // The entitlement stays ACTIVE until period_end — the consumer
    // shouldn't downgrade until then. We surface `cancelled`/`halted`
    // as a status flag so the consumer can render "ending on X" and
    // send the appropriate email.
    await fireEntitlementUpdated(db, endpoint, {
        app: sub.app_slug,
        uid: sub.external_uid,
        tier: sub.tier,
        active: true,
        status: status,
        expires_at: sub.current_period_end,
        provider_subscription_id: providerSubId,
        failed,
    } as any);
}

function mapSubStatus(razorpayStatus: string): string {
    switch (razorpayStatus) {
        case "activated":
            return "active";
        case "paused":
            return "past_due";
        case "halted":
            return "past_due";
        case "cancelled":
            return "cancelled";
        case "completed":
            return "expired";
        default:
            return razorpayStatus;
    }
}

function deriveTier(session: any): string {
    // Fallback: 'member'. The proper tier is on the product row but we
    // don't want a synchronous join here in the webhook hot path; the
    // upsert keys on provider_subscription_id so the row already exists
    // with the correct tier from checkout-session creation.
    const meta = (() => {
        try {
            return session.metadata ? JSON.parse(session.metadata) : {};
        } catch {
            return {};
        }
    })();
    return meta.plan || meta.tier || "member";
}
