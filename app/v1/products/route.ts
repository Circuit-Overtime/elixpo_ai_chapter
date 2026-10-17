export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import { SyncError, syncProduct } from "@/lib/catalog-sync";
import { getDatabase } from "@/lib/d1-client";

/**
 * POST /v1/products
 *
 * Sync a single product and its pricing tiers from the consuming app,
 * authenticated by the app's secret key. Thin alias over the catalog-sync
 * helper; for a whole catalog in one call use POST /v1/sync.
 *
 * Body:
 * {
 *   "product": { "tier": "member", "name": "Blogs Member", "description": "…" },
 *   "tiers": [
 *     { "nickname": "India",  "currency": "INR", "unit_amount": 19900, "interval": "month", "region": "IN" },
 *     { "nickname": "Global", "currency": "USD", "unit_amount":   600, "interval": "month" }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const db = await getDatabase();
        const app = await appFromApiKey(db, request);
        if (!app) {
            return NextResponse.json(
                { error: "unauthorized" },
                { status: 401 },
            );
        }

        const body: any = await request.json().catch(() => ({}));
        const prod = body.product || {};

        const result = await syncProduct(db, app.id, {
            tier: prod.tier,
            name: prod.name,
            description: prod.description,
            prices: Array.isArray(body.tiers) ? body.tiers : body.prices,
        });

        return NextResponse.json({
            ok: true,
            app: app.slug,
            product: result.product,
            tiers: result.prices,
        });
    } catch (err: any) {
        if (err instanceof SyncError) {
            return NextResponse.json(
                { error: err.code, error_description: err.message },
                { status: 400 },
            );
        }
        console.error("[v1/products] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
