export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import { getDatabase } from "@/lib/d1-client";
import {
    createCheckoutSession,
    resolveProductAndPrice,
    upsertCustomer,
} from "@/lib/repo";

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

/**
 * POST /v1/checkout/sessions
 *
 * Server-to-server. The consuming app authenticates with its secret key
 * (`Authorization: Bearer lix_pay_…`) and asks us to start a checkout for one of
 * its buyers. This REPLACES the old signed-handoff token: the app no longer
 * signs an amount — Elixpo Pay resolves the price from its own catalog by
 * (tier, currency), so the price can't be tampered with and there is no shared
 * HANDOFF secret to distribute.
 *
 * Body:
 * {
 *   "tier": "member",                    // product tier to purchase (required)
 *   "customer": { "uid": "u_123", "email": "a@b.com" },   // buyer (uid required)
 *   "currency": "INR",                   // optional; defaults to INR
 *   "success_url": "https://app/return", // where checkout returns the buyer
 *   "metadata": { ... }                  // optional, echoed onto the session
 * }
 *
 * Response: { id, url, amount, currency, expires_at }
 *   `url` is the hosted checkout page — redirect the buyer there.
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
        const tier = String(body.tier || "")
            .trim()
            .toLowerCase();
        if (!tier) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "tier is required",
                },
                { status: 400 },
            );
        }

        const customer = body.customer || {};
        const uid = customer.uid ? String(customer.uid) : "";
        const email = customer.email ? String(customer.email) : null;
        if (!uid) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "customer.uid is required",
                },
                { status: 400 },
            );
        }

        const currency = String(body.currency || "INR").toUpperCase();
        if (!CURRENCIES.includes(currency)) {
            return NextResponse.json(
                {
                    error: "invalid_currency",
                    error_description: `Unsupported currency '${currency}'`,
                },
                { status: 400 },
            );
        }

        // Price is resolved from OUR catalog — never trusted from the caller.
        const resolved = await resolveProductAndPrice(
            db,
            app.id,
            tier,
            currency,
        );
        if (!resolved) {
            return NextResponse.json(
                {
                    error: "unknown_plan",
                    error_description: `No active product for tier '${tier}'`,
                },
                { status: 404 },
            );
        }
        if (!resolved.price) {
            return NextResponse.json(
                {
                    error: "no_price",
                    error_description: `No active ${currency} price for tier '${tier}'`,
                },
                { status: 404 },
            );
        }

        const amount = resolved.price.unit_amount;
        const returnUrl = body.success_url
            ? String(body.success_url)
            : app.return_url;

        const customerId = await upsertCustomer(db, app.id, uid, email);

        // Defensive auto-cancel of any pre-existing active recurring
        // subscription for this (app, customer) before creating a new
        // one — prevents the "two simultaneously-active subs both
        // billing" failure mode if the consuming app's tier mirror
        // drifted (e.g. manual SQL reset bypassed the plan-change
        // detector). Only fires for recurring price selections; one-time
        // checkouts are stateless and don't need this.
        if (resolved.price.type === "recurring") {
            try {
                const stale = ((
                    await db
                        .prepare(
                            `SELECT id, provider_subscription_id
                             FROM subscriptions
                             WHERE app_id = ? AND customer_id = ?
                               AND billing_mode = 'recurring'
                               AND status IN ('active','past_due')
                               AND cancel_at IS NULL`,
                        )
                        .bind(app.id, customerId)
                        .all()
                ).results ?? []) as Array<{
                    id: string;
                    provider_subscription_id: string | null;
                }>;
                if (stale.length > 0) {
                    const { razorpayFromEnv } = await import(
                        "@/lib/providers/razorpay"
                    );
                    const { getEnv } = await import("@/lib/env");
                    const razorpay = await razorpayFromEnv(getEnv);
                    for (const s of stale) {
                        if (razorpay && s.provider_subscription_id) {
                            try {
                                // Immediate cancel (not graceful) — the
                                // user is moving to a NEW sub right now,
                                // no need to keep the old period alive.
                                await razorpay.cancelSubscription(
                                    s.provider_subscription_id,
                                    false,
                                );
                            } catch (err) {
                                console.warn(
                                    "[v1/checkout/sessions] couldn't cancel stale sub %s upstream (proceeding): %s",
                                    s.provider_subscription_id,
                                    err instanceof Error ? err.message : String(err),
                                );
                            }
                        }
                        await db
                            .prepare(
                                "UPDATE subscriptions SET status='cancelled', cancel_at=datetime('now'), updated_at=datetime('now') WHERE id = ?",
                            )
                            .bind(s.id)
                            .run();
                    }
                    console.log(
                        "[v1/checkout/sessions] auto-cancelled %d stale recurring sub(s) for app=%s uid=%s",
                        stale.length,
                        app.slug,
                        uid,
                    );
                }
            } catch (err) {
                // Don't block checkout on cleanup failure — the worst
                // case is the same pre-fix behaviour (duplicate sub).
                console.error(
                    "[v1/checkout/sessions] stale-sub cleanup failed (non-fatal): %s",
                    err instanceof Error ? err.message : String(err),
                );
            }
        }

        const metadata: Record<string, unknown> = {
            plan: tier,
            source: "api",
        };
        if (body.metadata && typeof body.metadata === "object") {
            Object.assign(metadata, body.metadata);
        }

        const sessionId = await createCheckoutSession(db, {
            appId: app.id,
            customerId,
            externalUid: uid,
            productId: resolved.product.id,
            priceId: resolved.price.id,
            currency,
            amount,
            returnUrl,
            metadata,
        });

        const url = `${request.nextUrl.origin}/checkout?session=${encodeURIComponent(sessionId)}`;
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

        return NextResponse.json(
            {
                id: sessionId,
                url,
                amount,
                currency,
                tier: resolved.product.tier,
                expires_at: expiresAt,
            },
            { status: 201 },
        );
    } catch (err: any) {
        console.error("[v1/checkout/sessions] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
