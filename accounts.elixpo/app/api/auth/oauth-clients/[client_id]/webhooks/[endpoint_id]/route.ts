export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { type AppWebhookEvent, VALID_EVENTS } from "@/lib/app-webhooks";
import { getDatabase } from "@/lib/d1-client";
import {
    deleteAppWebhookEndpoint,
    getAppWebhookEndpoint,
    updateAppWebhookEndpoint,
} from "@/lib/db";
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

/**
 * Asserts: (a) endpoint exists, (b) under client_id from the URL,
 * (c) owned by caller. Returns the loaded row on success or a NextResponse
 * error on failure.
 */
async function loadOwnedEndpoint(
    db: D1Database,
    clientId: string,
    endpointId: string,
    userId: string,
) {
    const row = await getAppWebhookEndpoint(db, endpointId);
    if (!row || row.client_id !== clientId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ownerRow = await db
        .prepare("SELECT owner_id FROM oauth_clients WHERE client_id = ?")
        .bind(clientId)
        .first<{ owner_id: string }>();
    if (!ownerRow || ownerRow.owner_id !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return row;
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

/**
 * PATCH /api/auth/oauth-clients/:client_id/webhooks/:endpoint_id
 *
 * Mutable fields: url, events, is_active, label.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string; endpoint_id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { client_id, endpoint_id } = await params;
    const db = await getDatabase();
    const loaded = await loadOwnedEndpoint(
        db,
        client_id,
        endpoint_id,
        auth.sub,
    );
    if (loaded instanceof NextResponse) return loaded;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch: {
        url?: string;
        events?: string;
        is_active?: boolean;
        label?: string | null;
    } = {};

    if ("url" in body) {
        const r = validateUrl(body.url);
        if (r instanceof NextResponse) return r;
        patch.url = r;
    }
    if ("events" in body) {
        if (!Array.isArray(body.events) || body.events.length === 0) {
            return NextResponse.json(
                { error: "events must be a non-empty array" },
                { status: 400 },
            );
        }
        for (const ev of body.events) {
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
        patch.events = JSON.stringify(body.events);
    }
    if ("is_active" in body) {
        if (typeof body.is_active !== "boolean") {
            return NextResponse.json(
                { error: "is_active must be a boolean" },
                { status: 400 },
            );
        }
        patch.is_active = body.is_active;
    }
    if ("label" in body) {
        if (body.label === null) {
            patch.label = null;
        } else if (typeof body.label === "string" && body.label.length <= 64) {
            patch.label = body.label;
        } else {
            return NextResponse.json(
                { error: "label must be a string (≤64) or null" },
                { status: 400 },
            );
        }
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 },
        );
    }

    const ok = await updateAppWebhookEndpoint(db, endpoint_id, auth.sub, patch);
    if (!ok) {
        return NextResponse.json({ error: "Update failed" }, { status: 400 });
    }

    const fresh = await getAppWebhookEndpoint(db, endpoint_id);
    if (!fresh) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
        id: fresh.id,
        url: fresh.url,
        events: safeJsonArray(fresh.events),
        is_active: !!fresh.is_active,
        label: fresh.label,
        created_at: fresh.created_at,
        secret_set_at: fresh.secret_set_at,
        last_delivery_at: fresh.last_delivery_at,
        last_status_code: fresh.last_status_code,
        last_error: fresh.last_error,
    });
}

/**
 * DELETE /api/auth/oauth-clients/:client_id/webhooks/:endpoint_id
 *
 * Removes the endpoint and its KV-stored secret. Idempotent: a 404 here
 * means the endpoint was already gone.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string; endpoint_id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { client_id, endpoint_id } = await params;
    const db = await getDatabase();
    const loaded = await loadOwnedEndpoint(
        db,
        client_id,
        endpoint_id,
        auth.sub,
    );
    if (loaded instanceof NextResponse) return loaded;

    const ok = await deleteAppWebhookEndpoint(db, endpoint_id, auth.sub);
    if (!ok) {
        return NextResponse.json({ error: "Delete failed" }, { status: 400 });
    }

    // Cleanup KV. Non-fatal on failure — orphan plaintext is unreachable
    // since the row is gone and the resolver returns null without a row.
    try {
        const kv = (getRequestContext().env as any).KV as KVNamespace;
        await kv.delete(`webhook_secret:${endpoint_id}`);
    } catch {
        /* swallow */
    }
    return NextResponse.json({ deleted: true });
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
