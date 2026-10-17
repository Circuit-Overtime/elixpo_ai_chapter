export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { fulfillPayment } from "@/lib/fulfill";
import { getCheckoutSession } from "@/lib/repo";

/**
 * POST /api/checkout/test-complete  { session_id }
 *
 * Test-mode fulfillment — simulates a successful payment WITHOUT a real
 * provider, so the checkout -> grant -> entitlement loop works before Razorpay
 * is connected. Disabled in production. Idempotent (same as the real paths).
 */
export async function POST(request: NextRequest) {
    const environment = await getEnv("ENVIRONMENT");
    if (environment === "production") {
        return NextResponse.json(
            { error: "disabled_in_production" },
            { status: 403 },
        );
    }

    try {
        const body: any = await request.json().catch(() => ({}));
        const sessionId = body.session_id;
        if (!sessionId) {
            return NextResponse.json(
                { error: "invalid_request" },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const session = await getCheckoutSession(db, sessionId);
        if (!session) {
            return NextResponse.json(
                { error: "unknown_session" },
                { status: 404 },
            );
        }

        const appSlug = (await db
            .prepare("SELECT slug FROM apps WHERE id = ?")
            .bind(session.app_id)
            .first()) as { slug: string } | null;

        const paymentId = `pay_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
        const orderId = session.provider_order_id || `order_test_${session.id}`;

        const result = await fulfillPayment(db, {
            session,
            appSlug: appSlug?.slug ?? "",
            providerOrderId: orderId,
            providerPaymentId: paymentId,
            amount: session.amount,
            currency: session.currency,
            raw: { source: "test_mode", test: true },
        });

        return NextResponse.json({
            ok: true,
            test_mode: true,
            entitlement: result.entitlement,
            return_url: session.return_url,
        });
    } catch (err: any) {
        console.error("[checkout/test-complete] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
