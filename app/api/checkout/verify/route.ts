export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { fulfillPayment } from "@/lib/fulfill";
import { razorpayFromEnv } from "@/lib/providers/razorpay";
import { getCheckoutSession } from "@/lib/repo";

/**
 * POST /api/checkout/verify
 *
 * Body: { session_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Called from the hosted checkout page's Razorpay success handler. Verifies the
 * client handback signature and fulfills immediately for instant UX. Fulfillment
 * is idempotent, so the authoritative webhook re-running it is a no-op.
 */
export async function POST(request: NextRequest) {
    try {
        const body: any = await request.json().catch(() => ({}));
        const {
            session_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = body;

        if (
            !session_id ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return NextResponse.json(
                { error: "invalid_request" },
                { status: 400 },
            );
        }

        const razorpay = await razorpayFromEnv(getEnv);
        if (!razorpay) {
            return NextResponse.json(
                { error: "provider_unconfigured" },
                { status: 503 },
            );
        }

        const valid = await razorpay.verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        );
        if (!valid) {
            return NextResponse.json(
                { error: "invalid_signature" },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const session = await getCheckoutSession(db, session_id);
        if (!session) {
            return NextResponse.json(
                { error: "unknown_session" },
                { status: 404 },
            );
        }
        if (session.provider_order_id !== razorpay_order_id) {
            return NextResponse.json(
                { error: "order_mismatch" },
                { status: 400 },
            );
        }

        const appSlug = (await db
            .prepare("SELECT slug FROM apps WHERE id = ?")
            .bind(session.app_id)
            .first()) as { slug: string } | null;

        const result = await fulfillPayment(db, {
            session,
            appSlug: appSlug?.slug ?? "",
            providerOrderId: razorpay_order_id,
            providerPaymentId: razorpay_payment_id,
            amount: session.amount,
            currency: session.currency,
            raw: { source: "client_handback", razorpay_payment_id },
        });

        return NextResponse.json({
            ok: true,
            entitlement: result.entitlement,
            return_url: session.return_url,
        });
    } catch (err: any) {
        console.error("[checkout/verify] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
