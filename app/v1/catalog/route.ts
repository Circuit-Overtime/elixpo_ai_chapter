export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getAppBySlug } from "@/lib/repo";

// Public read endpoint — allow any origin so a consuming app can render its
// pricing page client-side.
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /v1/catalog?app=<slug>
 *
 * Public product catalog — the active product and its active pricing tiers for
 * an app. No secret required (read-only, non-sensitive) so a consuming app can
 * render its pricing page directly from Elixpo Pay.
 */
export async function GET(request: NextRequest) {
    try {
        const appSlug = request.nextUrl.searchParams.get("app");
        if (!appSlug) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "app is required",
                },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const app = await getAppBySlug(db, appSlug);
        if (!app) {
            return NextResponse.json({ error: "unknown_app" }, { status: 404 });
        }

        const product = (await db
            .prepare(
                "SELECT id, name, tier, description FROM products WHERE app_id = ? AND active = 1 ORDER BY created_at LIMIT 1",
            )
            .bind(app.id)
            .first()) as any;

        if (!product) {
            return NextResponse.json({
                app: appSlug,
                product: null,
                tiers: [],
            });
        }

        const tiers = await db
            .prepare(
                `SELECT id, nickname, currency, unit_amount, interval, interval_count, region
                 FROM prices WHERE product_id = ? AND active = 1
                 ORDER BY unit_amount`,
            )
            .bind(product.id)
            .all();

        return NextResponse.json(
            {
                app: appSlug,
                product: {
                    name: product.name,
                    tier: product.tier,
                    description: product.description,
                },
                tiers: (tiers.results ?? []).map((t: any) => ({
                    id: t.id,
                    name: t.nickname,
                    currency: t.currency,
                    unit_amount: t.unit_amount,
                    interval: t.interval,
                    interval_count: t.interval_count,
                    region: t.region,
                })),
            },
            { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
        );
    } catch (err: any) {
        console.error("[v1/catalog] error:", err);
        return NextResponse.json(
            { error: "server_error" },
            { status: 500, headers: CORS },
        );
    }
}
