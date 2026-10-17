export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { verifyHmacSha256Hex } from "@/lib/crypto";
import { getDatabase } from "@/lib/d1-client";
import {
    type EntitlementRow,
    revokeEntitlement,
    toView,
} from "@/lib/entitlements";
import { getEnv } from "@/lib/env";
import { getWebhookEndpoint } from "@/lib/repo";
import { fireEntitlementUpdated } from "@/lib/webhooks";

/**
 * POST /api/webhooks/account-revoked
 *
 * Inbound webhook from accounts.elixpo (the identity source of truth). Fired
 * when a user deletes their account or revokes a connected service. We stop
 * their billing: every active entitlement for that user is revoked and its
 * subscription cancelled (so it never renews), and we notify each consuming app
 * so it downgrades the user too.
 *
 * Contract (matches accounts.elixpo webhook delivery + blogs' receiver):
 *   Headers: X-Webhook-Signature: hex(HMAC-SHA256(rawBody, ACCOUNTS_WEBHOOK_SECRET))
 *            X-Webhook-Event:     'user.deleted' | 'user.revoked' | 'app.revoked'
 *            X-Webhook-Timestamp: ISO-8601
 *   Body:    { user_id: "<accounts user id>", ... }
 *
 * accounts.elixpo user id === the external_uid apps bill against.
 */

const ACCEPTED_EVENTS = new Set([
    "user.deleted",
    "user.revoked",
    "app.revoked",
]);
const MAX_SKEW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
    const secret = await getEnv("ACCOUNTS_WEBHOOK_SECRET");
    if (!secret) {
        console.error(
            "[account-revoked] ACCOUNTS_WEBHOOK_SECRET not configured",
        );
        return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    const raw = await request.text();
    const signature = request.headers.get("x-webhook-signature") || "";
    const event = request.headers.get("x-webhook-event") || "";
    const tsHeader = request.headers.get("x-webhook-timestamp");

    const ts = tsHeader ? Date.parse(tsHeader) : Number.NaN;
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
        return NextResponse.json({ error: "stale_timestamp" }, { status: 401 });
    }

    if (!(await verifyHmacSha256Hex(secret, raw, signature))) {
        return NextResponse.json({ error: "bad_signature" }, { status: 401 });
    }

    if (!ACCEPTED_EVENTS.has(event)) {
        // Ack so accounts doesn't retry events we don't act on.
        return NextResponse.json({ ok: true, ignored: event });
    }

    let body: any;
    try {
        body = JSON.parse(raw);
    } catch {
        body = {};
    }
    const userId =
        body.user_id ||
        body.userId ||
        body.sub ||
        body.id ||
        body.data?.user_id;
    if (!userId) {
        return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
    }

    try {
        const db = await getDatabase();
        // Every active entitlement this user holds, across all apps.
        const rows = ((
            await db
                .prepare(
                    `SELECT e.*, a.slug AS app_slug
                     FROM entitlements e JOIN apps a ON e.app_id = a.id
                     WHERE e.external_uid = ?1 AND e.status = 'active'`,
                )
                .bind(String(userId))
                .all()
        ).results ?? []) as any[];

        let revoked = 0;
        for (const row of rows) {
            const updated = await revokeEntitlement(db, row as EntitlementRow);
            revoked++;
            // Best-effort downstream notification so the app downgrades the user.
            const endpoint = await getWebhookEndpoint(db, row.app_id);
            if (endpoint) {
                const view = toView(row.app_slug, updated, row.external_uid);
                await fireEntitlementUpdated(db, endpoint, view);
            }
        }

        console.log(
            `[account-revoked] event=${event} user=${userId} revoked=${revoked}`,
        );
        return NextResponse.json({ ok: true, revoked });
    } catch (e: any) {
        // Non-2xx tells accounts to retry (revocation is idempotent — already
        // non-active entitlements are skipped by the WHERE clause).
        console.error("[account-revoked] failed:", e?.message || e);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}
