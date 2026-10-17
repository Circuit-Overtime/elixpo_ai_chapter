export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { merchantOwnsApp, requireDashboard } from "@/lib/dashboard-auth";
import { newId } from "@/lib/ids";

/**
 * GET /api/dashboard/products — products (with nested prices) for the merchant.
 * Optional ?app_id= filter.
 */
export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const appId = request.nextUrl.searchParams.get("app_id");

    const products = await db
        .prepare(
            `SELECT p.id, p.app_id, p.name, p.tier, p.description, p.active, p.created_at,
                    a.slug AS app_slug, a.name AS app_name,
                    a.slug AS client_id, a.homepage_url, a.pricing_url
             FROM products p JOIN apps a ON p.app_id = a.id
             WHERE a.merchant_id = ?1 ${appId ? "AND p.app_id = ?2" : ""}
             ORDER BY p.created_at DESC`,
        )
        .bind(...(appId ? [merchantId, appId] : [merchantId]))
        .all();

    const prices = await db
        .prepare(
            `SELECT pr.id, pr.product_id, pr.nickname, pr.currency, pr.unit_amount, pr.type,
                    pr.interval, pr.interval_count, pr.region, pr.provider, pr.active
             FROM prices pr
             JOIN products p ON pr.product_id = p.id
             JOIN apps a ON p.app_id = a.id
             WHERE a.merchant_id = ?
             ORDER BY pr.created_at`,
        )
        .bind(merchantId)
        .all();

    const byProduct: Record<string, any[]> = {};
    for (const pr of prices.results ?? []) {
        const pid = (pr as any).product_id;
        if (!byProduct[pid]) byProduct[pid] = [];
        byProduct[pid].push(pr);
    }

    const out = (products.results ?? []).map((p: any) => ({
        ...p,
        prices: byProduct[p.id] ?? [],
    }));

    return NextResponse.json({ products: out });
}

/** POST /api/dashboard/products — create a product (a sellable tier). */
export async function POST(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    const body: any = await request.json().catch(() => ({}));
    const appId = String(body.app_id || "");
    const name = String(body.name || "").trim();
    const tier = String(body.tier || "")
        .trim()
        .toLowerCase();
    const description = body.description
        ? String(body.description).trim()
        : null;

    if (!appId || !name || !tier) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "app_id, name, tier required",
            },
            { status: 400 },
        );
    }
    if (!/^[a-z0-9_]{2,32}$/.test(tier)) {
        return NextResponse.json(
            {
                error: "invalid_tier",
                error_description: "2-32 chars, a-z 0-9 _",
            },
            { status: 400 },
        );
    }

    const app = await merchantOwnsApp(db, merchantId, appId);
    if (!app) {
        return NextResponse.json({ error: "forbidden_app" }, { status: 403 });
    }

    const id = newId("product");
    await db
        .prepare(
            "INSERT INTO products (id, app_id, name, tier, description, active) VALUES (?, ?, ?, ?, ?, 1)",
        )
        .bind(id, appId, name, tier, description)
        .run();

    return NextResponse.json({
        product: {
            id,
            app_id: appId,
            name,
            tier,
            description,
            active: 1,
            prices: [],
        },
    });
}
