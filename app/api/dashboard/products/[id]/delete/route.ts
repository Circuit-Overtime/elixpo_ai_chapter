export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import type { D1Database } from "@cloudflare/workers-types";
import { requireDashboard } from "@/lib/dashboard-auth";

/**
 * POST /api/dashboard/products/:id/delete — PERMANENTLY delete the product.
 *
 * Hard-deletes the app and every child record (tiers, prices, webhook config,
 * credentials, customers, sessions). This is irreversible — distinct from the
 * soft Archive (DELETE) which just pauses payments.
 *
 * Guard: refused if the product has any CAPTURED payment, so financial records
 * are never destroyed — the merchant must Archive instead in that case.
 */
async function appForProduct(
    db: D1Database,
    merchantId: string,
    productId: string,
): Promise<{ id: string } | null> {
    return (await db
        .prepare(
            `SELECT a.id FROM products p JOIN apps a ON p.app_id = a.id
             WHERE p.id = ? AND a.merchant_id = ?`,
        )
        .bind(productId, merchantId)
        .first()) as { id: string } | null;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const { id } = await params;

    const app = await appForProduct(db, merchantId, id);
    if (!app) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const appId = app.id;

    // Protect financial records: never hard-delete a product that took money.
    const paid = (await db
        .prepare(
            "SELECT COUNT(*) AS n FROM transactions WHERE app_id = ? AND status = 'captured'",
        )
        .bind(appId)
        .first()) as { n: number } | null;
    if ((paid?.n ?? 0) > 0) {
        return NextResponse.json(
            {
                error: "has_payments",
                error_description:
                    "This product has captured payments. Archive it instead to keep your records.",
            },
            { status: 409 },
        );
    }

    // Cascade delete in FK-safe order. Break the checkout_sessions ⇄ transactions
    // cycle by nulling the back-reference first.
    const inProducts = "(SELECT id FROM products WHERE app_id = ?1)";
    await db.batch([
        db.prepare("UPDATE checkout_sessions SET transaction_id = NULL WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM ledger_entries WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM grants WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM webhook_deliveries WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM transactions WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM entitlements WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM subscriptions WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM checkout_sessions WHERE app_id = ?1").bind(appId),
        db.prepare(`DELETE FROM prices WHERE product_id IN ${inProducts}`).bind(appId),
        db.prepare("DELETE FROM products WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM webhook_endpoints WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM provider_connections WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM customers WHERE app_id = ?1").bind(appId),
        db.prepare("DELETE FROM apps WHERE id = ?1").bind(appId),
    ]);

    return NextResponse.json({ ok: true, deleted: true });
}
