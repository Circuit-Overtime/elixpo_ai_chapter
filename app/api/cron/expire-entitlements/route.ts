export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { sha256Hex, timingSafeEqual } from "@/lib/crypto";
import { getDatabase } from "@/lib/d1-client";
import {
    type EntitlementRow,
    expireEntitlement,
    toView,
} from "@/lib/entitlements";
import { getEnv } from "@/lib/env";
import { getWebhookEndpoint } from "@/lib/repo";
import { fireEntitlementUpdated } from "@/lib/webhooks";

/**
 * Entitlement expiry sweep. Find active entitlements whose 30-day window has
 * lapsed, mark them expired, and fire entitlement.updated (active:false) so the
 * consuming app downgrades the user. Trigger daily via a Cloudflare Cron / any
 * scheduler hitting this with the CRON_SECRET bearer token.
 *
 *   Authorization: Bearer <CRON_SECRET>      (or ?key=<CRON_SECRET>)
 *
 * Idempotent and batched (processes up to `limit` per run).
 */
async function handle(request: NextRequest) {
    const secret = await getEnv("CRON_SECRET");
    if (!secret) {
        return NextResponse.json(
            { error: "cron_unconfigured" },
            { status: 500 },
        );
    }
    const presented =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        request.nextUrl.searchParams.get("key") ||
        "";
    // Constant-time compare on hashes (presented may be empty / wrong length).
    const ok = timingSafeEqual(
        await sha256Hex(presented),
        await sha256Hex(secret),
    );
    if (!ok) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const limit = Math.min(
        500,
        Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 200)),
    );

    const db = await getDatabase();
    // Skip entitlements backed by an ACTIVE recurring subscription —
    // Razorpay handles the renewal charge and our webhook handler will
    // extend the period when `subscription.charged` arrives. Expiring them
    // would race the renewal and briefly knock the buyer offline.
    //
    // If the recurring subscription was cancelled / halted / completed,
    // the entitlement IS due to expire at period end (graceful downgrade),
    // so those rows fall through to the normal path.
    const due = await db
        .prepare(
            `SELECT e.* FROM entitlements e
             WHERE e.status = 'active'
               AND e.expires_at IS NOT NULL
               AND e.expires_at < datetime('now')
               AND NOT EXISTS (
                   SELECT 1 FROM subscriptions s
                   WHERE s.id = e.subscription_id
                     AND s.billing_mode = 'recurring'
                     AND s.status = 'active'
               )
             ORDER BY e.expires_at LIMIT ?`,
        )
        .bind(limit)
        .all();

    const rows = (due.results ?? []) as unknown as EntitlementRow[];
    let expired = 0;
    let notified = 0;

    // Cache app slug + webhook endpoint per app to avoid repeat lookups.
    const appCache = new Map<string, { slug: string; endpoint: any }>();

    for (const row of rows) {
        const updated = await expireEntitlement(db, row);
        expired++;

        let cached = appCache.get(row.app_id);
        if (!cached) {
            const app = (await db
                .prepare("SELECT slug FROM apps WHERE id = ?")
                .bind(row.app_id)
                .first()) as { slug: string } | null;
            const endpoint = await getWebhookEndpoint(db, row.app_id);
            cached = { slug: app?.slug ?? "", endpoint };
            appCache.set(row.app_id, cached);
        }

        if (cached.endpoint) {
            await fireEntitlementUpdated(
                db,
                cached.endpoint,
                toView(cached.slug, updated, row.external_uid),
            );
            notified++;
        }
    }

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        expired,
        notified,
        more: rows.length === limit,
    });
}

export async function POST(request: NextRequest) {
    return handle(request);
}

export async function GET(request: NextRequest) {
    return handle(request);
}
