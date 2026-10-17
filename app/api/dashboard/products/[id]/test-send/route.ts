export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { fulfillPayment } from "@/lib/fulfill";
import {
    createCheckoutSession,
    getCheckoutSession,
    upsertCustomer,
} from "@/lib/repo";

/**
 * POST /api/dashboard/products/[id]/test-send
 *
 * Dashboard-only. Fires a simulated (test-mode) checkout for each email in the
 * `emails` array. Each email becomes its own checkout session + fulfillment,
 * mirroring what the buyer would experience in a real purchase.
 *
 * Disabled in production — same guard as /api/checkout/test-complete.
 *
 * Body: { emails: string[] }   (1–10 addresses, validated server-side)
 *
 * Response: { results: Array<{ email: string; ok: boolean; error?: string }> }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 10;

/** Resolve the app + its first active product for a given product row id. */
async function appAndProductForId(
    db: Awaited<ReturnType<typeof getDatabase>>,
    merchantId: string,
    productId: string,
) {
    return (await db
        .prepare(
            `SELECT a.id AS app_id, a.slug AS app_slug,
                    p.id AS product_id, p.tier,
                    pr.id AS price_id, pr.unit_amount, pr.currency
             FROM products p
             JOIN apps a ON p.app_id = a.id
             LEFT JOIN prices pr ON pr.product_id = p.id AND pr.active = 1
             WHERE p.id = ? AND a.merchant_id = ?
             ORDER BY pr.created_at ASC
             LIMIT 1`,
        )
        .bind(productId, merchantId)
        .first()) as {
        app_id: string;
        app_slug: string;
        product_id: string;
        tier: string;
        price_id: string | null;
        unit_amount: number | null;
        currency: string | null;
    } | null;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const environment = await getEnv("ENVIRONMENT");
    if (environment === "production") {
        return NextResponse.json(
            { error: "disabled_in_production" },
            { status: 403 },
        );
    }

    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const { id } = await params;

    const body: unknown = await request.json().catch(() => ({}));
    const rawEmails: unknown =
        typeof body === "object" &&
        body !== null &&
        "emails" in body
            ? (body as Record<"emails", unknown>).emails
            : undefined;

    if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
        return NextResponse.json(
            { error: "invalid_request", error_description: "emails[] is required" },
            { status: 400 },
        );
    }

    const emails = (rawEmails as unknown[])
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);

    if (emails.length > MAX_EMAILS) {
        return NextResponse.json(
            {
                error: "too_many_emails",
                error_description: `Maximum ${MAX_EMAILS} emails per test send`,
            },
            { status: 400 },
        );
    }

    const row = await appAndProductForId(db, merchantId, id);
    if (!row) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!row.price_id || row.unit_amount == null || !row.currency) {
        return NextResponse.json(
            {
                error: "no_price",
                error_description:
                    "This product has no active price — sync your catalog first.",
            },
            { status: 400 },
        );
    }

    // Process each email sequentially — D1 can reject concurrent writes within
    // a single invocation, so a `Promise.all` over (upsert + createSession +
    // fulfill) is a sporadic-failure risk. One bad address never aborts the
    // batch: invalid emails are reported per-row and skipped.
    const results = [];
    for (const email of emails) {
        if (!EMAIL_RE.test(email)) {
            results.push({ email, ok: false, error: "invalid_email" });
            continue;
        }
        try {
            // Each email is a distinct synthetic buyer uid so entitlements
            // don't collide between addresses in the same test batch.
            const uid = `test_${email.replace(/[^a-z0-9]/g, "_")}`;
            const customerId = await upsertCustomer(
                db,
                row.app_id,
                uid,
                email,
            );

            const sessionId = await createCheckoutSession(db, {
                appId: row.app_id,
                customerId,
                externalUid: uid,
                productId: row.product_id,
                priceId: row.price_id,
                currency: row.currency!,
                amount: row.unit_amount!,
                returnUrl: null,
                metadata: { source: "dashboard_test_send", email },
                expiresInMinutes: 5,
            });

            const session = await getCheckoutSession(db, sessionId);
            if (!session) throw new Error("session not found after create");

            const paymentId = `pay_test_${crypto
                .randomUUID()
                .replace(/-/g, "")
                .slice(0, 18)}`;
            const orderId = `order_test_${sessionId}`;

            await fulfillPayment(db, {
                session,
                appSlug: row.app_slug,
                providerOrderId: orderId,
                providerPaymentId: paymentId,
                amount: row.unit_amount!,
                currency: row.currency!,
                raw: { source: "dashboard_test_send", test: true, email },
            });

            results.push({ email, ok: true });
        } catch (err) {
            results.push({
                email,
                ok: false,
                error:
                    err instanceof Error
                        ? err.message
                        : String(err),
            });
        }
    }

    return NextResponse.json({ results });
}
