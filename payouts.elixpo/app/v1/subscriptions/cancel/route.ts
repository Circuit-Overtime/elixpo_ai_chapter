export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { razorpayFromEnv } from "@/lib/providers/razorpay";

/**
 * POST /v1/subscriptions/cancel
 *
 * Cancel a customer's active recurring subscription. Graceful by default:
 * Razorpay's `cancel_at_cycle_end=true` keeps the entitlement valid through
 * the buyer's current paid period, then stops billing. The
 * `subscription.cancelled` webhook from Razorpay then drives the entitlement
 * updates back to the consuming app.
 *
 * Auth: Bearer <app secret key>
 * Body: {
 *   customer: { uid: "user_xxx" },
 *   cancel_at_cycle_end?: true   // default true (graceful)
 * }
 *
 * Response: { id, status, current_period_end }
 *
 * Idempotent at the app/customer level — calling twice on an already-cancelled
 * sub returns 200 with the existing status, not 4xx.
 */
export async function POST(request: NextRequest) {
    try {
        const db = await getDatabase();
        const app = await appFromApiKey(db, request);
        if (!app) {
            return NextResponse.json(
                {
                    error: "unauthorized",
                    error_description: "Invalid or missing secret key",
                },
                { status: 401 },
            );
        }

        const body: any = await request.json().catch(() => ({}));
        const uid = body?.customer?.uid ? String(body.customer.uid) : "";
        if (!uid) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "customer.uid is required",
                },
                { status: 400 },
            );
        }
        const cancelAtCycleEnd = body?.cancel_at_cycle_end !== false;

        // Find the most recent active recurring subscription for this
        // (app, customer). We match by customer.external_uid because the
        // app doesn't know our internal customer_id.
        const sub = (await db
            .prepare(
                `SELECT s.id, s.provider_subscription_id, s.status,
                        s.current_period_end, s.billing_mode
                 FROM subscriptions s
                 JOIN customers c ON c.id = s.customer_id
                 WHERE s.app_id = ?
                   AND c.external_uid = ?
                   AND s.billing_mode = 'recurring'
                   AND s.status IN ('active','past_due','pending')
                 ORDER BY s.created_at DESC LIMIT 1`,
            )
            .bind(app.id, uid)
            .first()) as
            | {
                  id: string;
                  provider_subscription_id: string | null;
                  status: string;
                  current_period_end: string | null;
                  billing_mode: string;
              }
            | null;

        if (!sub) {
            return NextResponse.json(
                {
                    error: "no_active_subscription",
                    error_description: `No active recurring subscription found for uid='${uid}'`,
                },
                { status: 404 },
            );
        }

        if (!sub.provider_subscription_id) {
            return NextResponse.json(
                {
                    error: "no_provider_subscription",
                    error_description:
                        "This subscription has no provider id — cancel manually.",
                },
                { status: 422 },
            );
        }

        const razorpay = await razorpayFromEnv(getEnv);
        if (!razorpay) {
            return NextResponse.json(
                { error: "provider_unconfigured" },
                { status: 503 },
            );
        }

        let providerStatus: string;
        try {
            const result = await razorpay.cancelSubscription(
                sub.provider_subscription_id,
                cancelAtCycleEnd,
            );
            providerStatus = result.status;
        } catch (err: any) {
            const msg = String(err?.message || err);
            // Razorpay returns "Subscription is already cancelled" if you
            // re-hit cancel — treat that as idempotent success.
            if (/already cancelled|already canceled/i.test(msg)) {
                providerStatus = "cancelled";
            } else {
                console.error("[v1/subscriptions/cancel] razorpay error:", msg);
                return NextResponse.json(
                    {
                        error: "provider_error",
                        error_description: msg.slice(0, 240),
                    },
                    { status: 502 },
                );
            }
        }

        // Mark the row pending the webhook. cancel_at = now means "the
        // user requested cancel at this time"; status flips to 'cancelled'
        // on the subscription.cancelled webhook (or here if Razorpay
        // returned 'cancelled' immediately because cancel_at_cycle_end
        // was false).
        const finalStatus =
            providerStatus === "cancelled" || !cancelAtCycleEnd
                ? "cancelled"
                : "active";
        await db
            .prepare(
                `UPDATE subscriptions
                 SET status = ?, cancel_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?`,
            )
            .bind(finalStatus, sub.id)
            .run();

        // ── Inline notify the consuming app immediately ──────────────────
        //
        // Razorpay only sends `subscription.cancelled` on graceful cancels
        // at period_end (i.e. ~31 days later for monthly). That's far too
        // late for a "your cancellation is confirmed" email — buyers
        // expect it within seconds of clicking Cancel.
        //
        // Fire entitlement.updated outbound right here, with the same
        // shape the webhook handler would have sent. The flag
        // `subscriptions.cancel_at` we just set above acts as the dedup
        // marker: when Razorpay's eventual webhook lands, the handler
        // sees cancel_at is set and skips the outbound, avoiding a
        // duplicate email.
        try {
            const { getWebhookEndpoint } = await import("@/lib/repo");
            const endpoint = await getWebhookEndpoint(db, app.id);
            if (endpoint) {
                const { fireEntitlementUpdated } = await import(
                    "@/lib/webhooks"
                );
                const subWithSlug = (await db
                    .prepare(
                        `SELECT s.tier, s.current_period_end, a.slug
                         FROM subscriptions s
                         JOIN apps a ON a.id = s.app_id
                         WHERE s.id = ?`,
                    )
                    .bind(sub.id)
                    .first()) as
                    | { tier: string; current_period_end: string | null; slug: string }
                    | null;
                if (subWithSlug) {
                    await fireEntitlementUpdated(db, endpoint, {
                        app: subWithSlug.slug,
                        uid,
                        tier: subWithSlug.tier,
                        // Graceful: access stays active until period_end.
                        active: true,
                        status: "cancelled",
                        expires_at: subWithSlug.current_period_end,
                        provider_subscription_id: sub.provider_subscription_id,
                        failed: false,
                    } as any);
                }
            }
        } catch (err) {
            // Best-effort: the consuming app's cancellation email is
            // nicer-to-have. The cancel itself already succeeded; we
            // don't want a notification hiccup to surface as a cancel
            // failure to the caller.
            console.error(
                "[v1/subscriptions/cancel] inline notify failed (non-fatal): %s",
                err instanceof Error ? err.message : String(err),
            );
        }

        return NextResponse.json({
            id: sub.id,
            status: finalStatus,
            cancel_at_cycle_end: cancelAtCycleEnd,
            current_period_end: sub.current_period_end,
            provider_status: providerStatus,
        });
    } catch (err: any) {
        console.error("[v1/subscriptions/cancel] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
