export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";

/** GET /api/dashboard/overview — headline metrics for the merchant. */
export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const counts = (await db
        .prepare(
            `SELECT
               (SELECT COUNT(*) FROM apps WHERE merchant_id = ?1) AS apps,
               (SELECT COUNT(DISTINCT a.id) FROM products p JOIN apps a ON p.app_id = a.id
                  WHERE a.merchant_id = ?1 AND p.active = 1) AS products,
               (SELECT COUNT(*) FROM entitlements e JOIN apps a ON e.app_id = a.id
                  WHERE a.merchant_id = ?1 AND e.status = 'active'
                  AND (e.expires_at IS NULL OR e.expires_at > datetime('now'))) AS active_entitlements,
               (SELECT COUNT(*) FROM transactions t JOIN apps a ON t.app_id = a.id
                  WHERE a.merchant_id = ?1 AND t.status = 'captured') AS paid_transactions`,
        )
        .bind(merchantId)
        .first()) as any;

    const revenue = await db
        .prepare(
            `SELECT t.currency AS currency, COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS total
             FROM transactions t JOIN apps a ON t.app_id = a.id
             WHERE a.merchant_id = ? AND t.status = 'captured'
             GROUP BY t.currency`,
        )
        .bind(merchantId)
        .all();

    const recent = await db
        .prepare(
            `SELECT t.id, t.amount, t.currency, t.status, t.created_at,
                    t.provider_payment_id, a.slug AS app_slug, c.external_uid AS uid
             FROM transactions t
             JOIN apps a ON t.app_id = a.id
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE a.merchant_id = ?
             ORDER BY t.created_at DESC
             LIMIT 8`,
        )
        .bind(merchantId)
        .all();

    return NextResponse.json(
        {
            counts: {
                apps: counts?.apps ?? 0,
                products: counts?.products ?? 0,
                activeEntitlements: counts?.active_entitlements ?? 0,
                paidTransactions: counts?.paid_transactions ?? 0,
            },
            revenue: (revenue.results ?? []).map((r: any) => ({
                currency: r.currency,
                count: r.count,
                total: r.total,
            })),
            recentTransactions: recent.results ?? [],
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
