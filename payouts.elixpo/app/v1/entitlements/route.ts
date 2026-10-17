export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { sha256Hex, timingSafeEqual } from "@/lib/crypto";
import { getDatabase } from "@/lib/d1-client";
import { getEntitlement, toView } from "@/lib/entitlements";
import { getAppBySlug } from "@/lib/repo";

/**
 * GET /v1/entitlements?app=<slug>&uid=<external uid>
 *
 * Server-to-server entitlement lookup for the consuming app. Auth:
 *   Authorization: Bearer <app secret key>   (or  X-Elixpo-Pay-Key: <key>)
 * The key is SHA-256-compared against apps.api_key_hash.
 *
 * Returns the EntitlementView (tier, status, active, expires_at, version).
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const appSlug = sp.get("app");
        const uid = sp.get("uid");

        if (!appSlug || !uid) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "app and uid are required",
                },
                { status: 400 },
            );
        }

        const authHeader = request.headers.get("authorization");
        const key = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : request.headers.get("x-elixpo-pay-key");

        if (!key) {
            return NextResponse.json(
                { error: "unauthorized", error_description: "missing API key" },
                { status: 401 },
            );
        }

        const db = await getDatabase();
        const app = await getAppBySlug(db, appSlug);
        if (!app || !app.api_key_hash) {
            return NextResponse.json({ error: "unknown_app" }, { status: 404 });
        }

        const presentedHash = await sha256Hex(key);
        if (!timingSafeEqual(presentedHash, app.api_key_hash)) {
            return NextResponse.json(
                { error: "unauthorized", error_description: "invalid API key" },
                { status: 401 },
            );
        }

        const row = await getEntitlement(db, app.id, uid);
        const view = toView(appSlug, row, uid);

        return NextResponse.json(view, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (err: any) {
        console.error("[v1/entitlements] error:", err);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}
