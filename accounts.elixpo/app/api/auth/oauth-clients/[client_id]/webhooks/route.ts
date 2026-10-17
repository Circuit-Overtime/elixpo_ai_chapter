export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import {
    type AppWebhookEvent,
    mintWebhookSecret,
    VALID_EVENTS,
} from "@/lib/app-webhooks";
import { getDatabase } from "@/lib/d1-client";
import { createAppWebhookEndpoint, listAppWebhookEndpoints } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

async function getAuth(request: NextRequest) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJWT(token);
    if (payload?.type !== "access") return null;
    return payload;
}

async function assertOwnership(
    db: D1Database,
    clientId: string,
    userId: string,
): Promise<NextResponse | null> {
    const row = await db
        .prepare(
            "SELECT owner_id FROM oauth_clients WHERE client_id = ? AND is_active = 1",
        )
        .bind(clientId)
        .first<{ owner_id: string }>();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.owner_id !== userId)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
}

function validateUrl(input: unknown): string | NextResponse {
    if (typeof input !== "string" || input.length === 0) {
        return NextResponse.json(
            { error: "url must be a non-empty string" },
            { status: 400 },
        );
    }
    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return NextResponse.json(
            { error: "url must use http or https" },
            { status: 400 },
        );
    }
    // http only allowed for localhost / loopback dev URLs.
    if (parsed.protocol === "http:") {
        const h = parsed.hostname;
        const isLoopback =
            h === "localhost" ||
            h === "127.0.0.1" ||
            h === "[::1]" ||
            h.endsWith(".localhost");
        if (!isLoopback) {
            return NextResponse.json(
                {
                    error: "http is only allowed for localhost. Use https.",
                },
                { status: 400 },
            );
        }
    }
    return input;
}

function validateEvents(input: unknown): string[] | NextResponse {
    if (!Array.isArray(input) || input.length === 0) {
        return NextResponse.json(
            { error: "events must be a non-empty array" },
            { status: 400 },
        );
    }
    for (const ev of input) {
        if (
            typeof ev !== "string" ||
            !VALID_EVENTS.includes(ev as AppWebhookEvent)
        ) {
            return NextResponse.json(
                {
                    error: `Invalid event: ${ev}. Valid: ${VALID_EVENTS.join(", ")}`,
                },
                { status: 400 },
            );
        }
    }
    return input as string[];
}

/**
 * GET /api/auth/oauth-clients/:client_id/webhooks
 *
 * List every webhook endpoint configured for the app. Owner-only. The
 * secret_hash is omitted from the response — only the metadata clients
 * need (URL, events, delivery status) is returned.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { client_id } = await params;
    const db = await getDatabase();
    const own = await assertOwnership(db, client_id, auth.sub);
    if (own) return own;

    const rows = await listAppWebhookEndpoints(db, client_id);
    const endpoints = rows.map((r) => ({
        id: r.id,
        url: r.url,
        events: safeJsonArray(r.events),
        is_active: !!r.is_active,
        label: r.label,
        created_at: r.created_at,
        secret_set_at: r.secret_set_at,
        last_delivery_at: r.last_delivery_at,
        last_status_code: r.last_status_code,
        last_error: r.last_error,
    }));
    return NextResponse.json({ endpoints });
}

/**
 * POST /api/auth/oauth-clients/:client_id/webhooks
 *
 * Create a new webhook endpoint for the app. Body:
 *   { url: "https://...", events: ["user.deleted", ...], label?: "prod" }
 *
 * Mints a fresh secret. Returns the secret plaintext ONCE in the response;
 * caller must store it. The hash sits in D1, the plaintext in KV.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { client_id } = await params;
    const db = await getDatabase();
    const own = await assertOwnership(db, client_id, auth.sub);
    if (own) return own;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const urlOrErr = validateUrl(body?.url);
    if (urlOrErr instanceof NextResponse) return urlOrErr;
    const eventsOrErr = validateEvents(body?.events);
    if (eventsOrErr instanceof NextResponse) return eventsOrErr;
    const label =
        typeof body?.label === "string" && body.label.length <= 64
            ? body.label
            : null;

    // Tier cap: limit webhook endpoints per app by the OWNER's tier.
    // /pricing promises 1 / 5 / unlimited endpoints per app on
    // Hobby / Indie / Studio — enforce that here. Also block any new
    // endpoint creation while the owner's sub is cancelled (existing
    // endpoints keep working; only new ones are blocked).
    try {
        const existing = await listAppWebhookEndpoints(db, client_id);
        const currentCount = Array.isArray(existing) ? existing.length : 0;
        const ownerRow = (await db
            .prepare(
                "SELECT tier, is_internal, tier_cancelled_at FROM users WHERE id = ?",
            )
            .bind(auth.sub)
            .first()) as {
            tier: string | null;
            is_internal: number;
            tier_cancelled_at: string | null;
        } | null;
        const { tierFromUserRow, TIER_LIMITS } = await import("@/lib/billing");
        const tier = tierFromUserRow(ownerRow);
        const cap = TIER_LIMITS[tier].maxWebhookEndpointsPerApp;

        const cancelled =
            !!ownerRow?.tier_cancelled_at && !ownerRow.is_internal;
        if (cancelled) {
            return NextResponse.json(
                {
                    error: "Your subscription is cancelled. Existing endpoints keep firing, but adding new ones needs an active subscription. Resubscribe from /pricing to continue.",
                    subscription_cancelled: true,
                    current_tier: tier,
                    upgrade_url: "/pricing",
                },
                { status: 403 },
            );
        }
        if (Number.isFinite(cap) && currentCount >= cap) {
            const overFromDowngrade = currentCount > cap;
            return NextResponse.json(
                {
                    error: overFromDowngrade
                        ? `This app has ${currentCount} webhook endpoints from a previous higher tier. Your current ${tier} plan covers ${cap} per app. Existing endpoints stay; upgrade to add more.`
                        : `Your ${tier} plan is limited to ${cap} webhook endpoint${cap === 1 ? "" : "s"} per app. Upgrade to add more.`,
                    tier_limit_exceeded: true,
                    over_from_downgrade: overFromDowngrade,
                    current_tier: tier,
                    current_count: currentCount,
                    limit: cap,
                    upgrade_url: "/pricing",
                },
                { status: 403 },
            );
        }
    } catch (err) {
        // Never block a legitimate endpoint create on a tier-lookup
        // hiccup — log and proceed.
        console.warn(
            "[webhooks POST] tier-gate skipped due to lookup error: %s",
            err instanceof Error ? err.message : String(err),
        );
    }

    // Mint, write KV first so the dispatcher can resolve the secret the
    // instant the D1 row is visible. If the D1 insert fails after the KV
    // write, the orphan KV entry is harmless (no row references it).
    const { plaintext, hash } = await mintWebhookSecret();
    const endpointId = crypto.randomUUID();

    try {
        const kv = (getRequestContext().env as any).KV as KVNamespace;
        await kv.put(`webhook_secret:${endpointId}`, plaintext);
    } catch (err) {
        console.error("[webhooks POST] KV write failed:", err);
        return NextResponse.json(
            { error: "Secret store unavailable; retry" },
            { status: 503 },
        );
    }

    try {
        await createAppWebhookEndpoint(db, {
            id: endpointId,
            clientId: client_id,
            url: urlOrErr,
            secretHash: hash,
            events: JSON.stringify(eventsOrErr),
            label,
        });
    } catch (err) {
        console.error("[webhooks POST] D1 insert failed:", err);
        // Clean up the orphan KV value.
        try {
            const kv = (getRequestContext().env as any).KV as KVNamespace;
            await kv.delete(`webhook_secret:${endpointId}`);
        } catch {
            /* swallow */
        }
        return NextResponse.json(
            { error: "Failed to create endpoint" },
            { status: 500 },
        );
    }

    return NextResponse.json(
        {
            id: endpointId,
            url: urlOrErr,
            events: eventsOrErr,
            is_active: true,
            label,
            webhook_secret: plaintext,
            _notice:
                "Store this secret. It will NOT be retrievable. Use it to verify the X-Elixpo-Signature header on this endpoint's deliveries.",
        },
        { status: 201 },
    );
}

function safeJsonArray(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
