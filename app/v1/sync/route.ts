export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import {
    type CatalogProductInput,
    SyncError,
    syncProduct,
} from "@/lib/catalog-sync";
import { getDatabase } from "@/lib/d1-client";

/**
 * POST /v1/sync
 *
 * Sync a consuming app's whole catalog (products + regional prices) in one call,
 * authenticated by the app's secret key. This is how tiers are managed — from
 * code, committed as a JSON file in the app's repo — NOT from the dashboard.
 *
 * Body (the catalog file):
 * {
 *   "app": {                       // optional — app-level metadata
 *     "homepage_url": "https://blogs.elixpo.com",
 *     "pricing_url":  "https://blogs.elixpo.com/pricing"
 *   },
 *   "products": [
 *     {
 *       "tier": "member",
 *       "name": "Blogs Member",
 *       "description": "Member-only reads, higher limits…",
 *       "prices": [
 *         { "nickname": "India",  "currency": "INR", "unit_amount": 19900, "interval": "month", "region": "IN" },
 *         { "nickname": "Global", "currency": "USD", "unit_amount":   600, "interval": "month" }
 *       ]
 *     }
 *   ]
 * }
 *
 * Each product upserts by (app, tier); its prices reconcile by
 * (currency, region, interval). A single product may also be posted as the bare
 * object (no `products` wrapper) for convenience.
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
        const products: CatalogProductInput[] = Array.isArray(body.products)
            ? body.products
            : body.tier
              ? [body] // single product posted directly
              : [];

        if (products.length === 0) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "products[] is required",
                },
                { status: 400 },
            );
        }

        // Optional app-level metadata (homepage / pricing links shown in the
        // dashboard). Only https URLs are accepted; unset fields are left as-is.
        let appUpdated = false;
        if (body.app && typeof body.app === "object") {
            const sets: string[] = [];
            const vals: any[] = [];
            const httpsUrl = (v: unknown) =>
                typeof v === "string" && /^https:\/\/.+/i.test(v.trim())
                    ? v.trim()
                    : null;
            if ("homepage_url" in body.app) {
                sets.push("homepage_url = ?");
                vals.push(httpsUrl(body.app.homepage_url));
            }
            if ("pricing_url" in body.app) {
                sets.push("pricing_url = ?");
                vals.push(httpsUrl(body.app.pricing_url));
            }
            if (sets.length) {
                vals.push(app.id);
                await db
                    .prepare(`UPDATE apps SET ${sets.join(", ")} WHERE id = ?`)
                    .bind(...vals)
                    .run();
                appUpdated = true;
            }
        }

        const synced: any[] = [];
        const errors: any[] = [];
        for (const p of products) {
            try {
                synced.push(await syncProduct(db, app.id, p));
            } catch (err: any) {
                if (err instanceof SyncError) {
                    errors.push({
                        tier: p?.tier ?? null,
                        error: err.code,
                        error_description: err.message,
                    });
                } else {
                    throw err;
                }
            }
        }

        return NextResponse.json({
            ok: errors.length === 0,
            app: app.slug,
            app_updated: appUpdated,
            synced,
            errors,
        });
    } catch (err: any) {
        console.error("[v1/sync] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
