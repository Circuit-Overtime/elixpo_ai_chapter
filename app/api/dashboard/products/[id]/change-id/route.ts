export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";

/** Hours the previous client_id keeps resolving after a change. */
const GRACE_HOURS = 5;

/**
 * POST /api/dashboard/products/:id/change-id
 *
 * Change the app's client_id (slug). The OLD id keeps working for a grace
 * window (5h) so the vendor can update their integration without downtime.
 * Body: { client_id: "new-slug" }
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
            `SELECT a.id, a.slug FROM products p JOIN apps a ON p.app_id = a.id
             WHERE p.id = ? AND a.merchant_id = ?`,
        )
        .bind(id, merchantId)
        .first()) as { id: string; slug: string } | null;
    if (!app) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body: any = await request.json().catch(() => ({}));
    const next = String(body.client_id || "")
        .trim()
        .toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(next)) {
        return NextResponse.json(
            {
                error: "invalid_client_id",
                error_description:
                    "3–40 chars: lowercase letters, digits and hyphens; must start with a letter.",
            },
            { status: 400 },
        );
    }
    if (next === app.slug) {
        return NextResponse.json(
            {
                error: "unchanged",
                error_description: "That's already the client id.",
            },
            { status: 400 },
        );
    }

    // Must be free: not another active app's current slug, nor a previous slug
    // still inside its own grace window.
    const clash = await db
        .prepare(
            `SELECT id FROM apps
             WHERE id != ?1 AND status = 'active'
               AND (slug = ?2
                    OR (prev_slug = ?2
                        AND prev_slug_expires_at IS NOT NULL
                        AND prev_slug_expires_at > datetime('now')))`,
        )
        .bind(app.id, next)
        .first();
    if (clash) {
        return NextResponse.json(
            { error: "taken", error_description: "That client id is in use." },
            { status: 409 },
        );
    }

    await db
        .prepare(
            `UPDATE apps
             SET prev_slug = slug,
                 prev_slug_expires_at = datetime('now', ?2),
                 slug = ?3,
                 updated_at = datetime('now')
             WHERE id = ?1`,
        )
        .bind(app.id, `+${GRACE_HOURS} hours`, next)
        .run();

    return NextResponse.json({
        ok: true,
        client_id: next,
        previous_client_id: app.slug,
        previous_valid_hours: GRACE_HOURS,
    });
}
