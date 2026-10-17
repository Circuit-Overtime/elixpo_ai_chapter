export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { sha256Hex } from "@/lib/crypto";
import { requireDashboard } from "@/lib/dashboard-auth";
import { resolveGrace } from "@/lib/grace";

/**
 * POST /api/dashboard/products/:id/regenerate-secret
 *
 * Rotates the app's secret key. With a grace option the OLD key keeps working
 * for the chosen window (immediate | 5m | 10m | 1h) so the vendor can redeploy
 * without dropped requests; otherwise it dies at once. The new key is returned
 * ONCE. Client ID (slug) is unchanged.
 *
 * Body: { grace?: "immediate" | "5m" | "10m" | "1h" }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const { id } = await params;

    const app = (await db
        .prepare(
            `SELECT a.id, a.slug, a.api_key_hash FROM products p JOIN apps a ON p.app_id = a.id
             WHERE p.id = ? AND a.merchant_id = ?`,
        )
        .bind(id, merchantId)
        .first()) as {
        id: string;
        slug: string;
        api_key_hash: string | null;
    } | null;
    if (!app) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body: any = await request.json().catch(() => ({}));
    const grace = resolveGrace(body.grace);

    const clientSecret = `lix_pay_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const secretHash = await sha256Hex(clientSecret);

    if (grace.sql && app.api_key_hash) {
        // Keep the old key valid until the grace expiry.
        await db
            .prepare(
                `UPDATE apps
                 SET prev_api_key_hash = api_key_hash,
                     prev_api_key_expires_at = datetime('now', ?2),
                     api_key_hash = ?3,
                     updated_at = datetime('now')
                 WHERE id = ?1`,
            )
            .bind(app.id, grace.sql, secretHash)
            .run();
    } else {
        // Immediate — clear any prior grace too.
        await db
            .prepare(
                `UPDATE apps
                 SET api_key_hash = ?2,
                     prev_api_key_hash = NULL,
                     prev_api_key_expires_at = NULL,
                     updated_at = datetime('now')
                 WHERE id = ?1`,
            )
            .bind(app.id, secretHash)
            .run();
    }

    return NextResponse.json({
        client_id: app.slug,
        client_secret: clientSecret, // shown once
        grace: grace.key,
        previous_valid_minutes: grace.minutes,
    });
}
