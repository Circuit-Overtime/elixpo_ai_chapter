export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import { resolveGrace } from "@/lib/grace";
import { newId } from "@/lib/ids";
import {
    normaliseEvents,
    parseEvents,
    WEBHOOK_EVENT_TYPES,
} from "@/lib/webhooks";

/**
 * Webhook endpoint management for a product's app (1 app = 1 product).
 *
 *   GET   → current endpoint (url, events, status, masked signing secret)
 *   PUT   → set/replace the destination url  { url }
 *   POST  → rotate the signing secret (returns the new whsec_ ONCE)
 *
 * The signing secret is what the consuming app uses to verify our
 * `entitlement.updated` deliveries. It is shown in full only at creation /
 * rotation time; thereafter the dashboard shows a masked preview.
 */

function genSigningSecret(): string {
    const hex = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    return `whsec_${hex.slice(0, 48)}`;
}

function maskSecret(secret: string | null): string | null {
    if (!secret) return null;
    return `${secret.slice(0, 11)}…${secret.slice(-4)}`;
}

/** Resolve the app behind a product, scoped to the merchant. */
async function appForProduct(
    db: D1Database,
    merchantId: string,
    productId: string,
): Promise<{ id: string; slug: string } | null> {
    return (await db
        .prepare(
            `SELECT a.id, a.slug FROM products p JOIN apps a ON p.app_id = a.id
             WHERE p.id = ? AND a.merchant_id = ?`,
        )
        .bind(productId, merchantId)
        .first()) as { id: string; slug: string } | null;
}

async function getEndpoint(db: D1Database, appId: string): Promise<any | null> {
    return db
        .prepare(
            "SELECT * FROM webhook_endpoints WHERE app_id = ? ORDER BY created_at LIMIT 1",
        )
        .bind(appId)
        .first();
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const { id } = await params;

    const app = await appForProduct(db, merchantId, id);
    if (!app) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const ep = await getEndpoint(db, app.id);
    return NextResponse.json(
        {
            available_events: WEBHOOK_EVENT_TYPES,
            endpoint: ep
                ? {
                      id: ep.id,
                      url: ep.url,
                      events: parseEvents(ep.events),
                      status: ep.status,
                      secret_preview: maskSecret(ep.signing_secret),
                      has_secret: !!ep.signing_secret,
                      prev_secret_expires_at:
                          ep.prev_signing_secret &&
                          ep.prev_signing_secret_expires_at &&
                          new Date(
                              `${ep.prev_signing_secret_expires_at.replace(
                                  " ",
                                  "T",
                              )}Z`,
                          ) > new Date()
                              ? ep.prev_signing_secret_expires_at
                              : null,
                  }
                : null,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;
    const { id } = await params;

    const app = await appForProduct(db, merchantId, id);
    if (!app) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body: any = await request.json().catch(() => ({}));
    const url = String(body.url || "").trim();
    if (!/^https:\/\/.+/i.test(url)) {
        return NextResponse.json(
            {
                error: "invalid_url",
                error_description: "A https:// URL is required",
            },
            { status: 400 },
        );
    }
    // Required events are always kept; unknown ones dropped.
    const events = JSON.stringify(normaliseEvents(body.events));

    const ep = await getEndpoint(db, app.id);
    let secretOnce: string | null = null;
    if (ep) {
        await db
            .prepare(
                "UPDATE webhook_endpoints SET url = ?, events = ?, status = 'active' WHERE id = ?",
            )
            .bind(url, events, ep.id)
            .run();
        // Mint a secret if this endpoint somehow never had one.
        if (!ep.signing_secret) {
            secretOnce = genSigningSecret();
            await db
                .prepare(
                    "UPDATE webhook_endpoints SET signing_secret = ? WHERE id = ?",
                )
                .bind(secretOnce, ep.id)
                .run();
        }
    } else {
        secretOnce = genSigningSecret();
        await db
            .prepare(
                `INSERT INTO webhook_endpoints (id, app_id, url, secret_ref, signing_secret, events, status)
                 VALUES (?, ?, ?, '', ?, ?, 'active')`,
            )
            .bind(newId("webhookEndpoint"), app.id, url, secretOnce, events)
            .run();
    }

    return NextResponse.json({ ok: true, url, signing_secret: secretOnce });
}

/**
 * POST — rotate the signing secret. With a grace option the OLD secret is kept
 * and Elixpo Pay DUAL-SIGNS deliveries (current + old) until it expires, so a
 * consumer redeploy can lag the rotation. Body: { grace?: "immediate"|"5m"|"10m"|"1h" }
 */
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

    const ep = await getEndpoint(db, app.id);
    if (!ep) {
        return NextResponse.json(
            {
                error: "no_endpoint",
                error_description: "Set a webhook URL first.",
            },
            { status: 400 },
        );
    }

    const body: any = await request.json().catch(() => ({}));
    const grace = resolveGrace(body.grace);
    const secret = genSigningSecret();

    if (grace.sql && ep.signing_secret) {
        await db
            .prepare(
                `UPDATE webhook_endpoints
                 SET prev_signing_secret = signing_secret,
                     prev_signing_secret_expires_at = datetime('now', ?2),
                     signing_secret = ?3
                 WHERE id = ?1`,
            )
            .bind(ep.id, grace.sql, secret)
            .run();
    } else {
        await db
            .prepare(
                `UPDATE webhook_endpoints
                 SET signing_secret = ?2,
                     prev_signing_secret = NULL,
                     prev_signing_secret_expires_at = NULL
                 WHERE id = ?1`,
            )
            .bind(ep.id, secret)
            .run();
    }

    return NextResponse.json({
        signing_secret: secret,
        grace: grace.key,
        previous_valid_minutes: grace.minutes,
    });
}
