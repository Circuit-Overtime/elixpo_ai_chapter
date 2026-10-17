export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";

/** GET /api/dashboard/transactions — recent transactions for the merchant. */
export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const limit = Math.min(
        100,
        Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)),
    );

    const rows = await db
        .prepare(
            `SELECT t.id, t.amount, t.currency, t.status, t.created_at,
                    t.provider, t.provider_payment_id, t.provider_order_id,
                    a.slug AS app_slug, c.external_uid AS uid
             FROM transactions t
             JOIN apps a ON t.app_id = a.id
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE a.merchant_id = ?
             ORDER BY t.created_at DESC
             LIMIT ?`,
        )
        .bind(merchantId, limit)
        .all();

    return NextResponse.json(
        { transactions: rows.results ?? [] },
        { headers: { "Cache-Control": "no-store" } },
    );
}
