export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { mintWebhookSecret } from "@/lib/app-webhooks";
import { getDatabase } from "@/lib/d1-client";
import {
    getAppWebhookEndpoint,
    rotateAppWebhookEndpointSecret,
} from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

/**
 * POST /api/auth/oauth-clients/:client_id/webhooks/:endpoint_id/rotate
 *
 * Mint a fresh secret for one specific endpoint. KV gets written first so
 * an in-flight delivery either uses the new secret or fails verification
 * cleanly (never serves a stale-but-valid signature from a half-completed
 * rotation). Old secret stops being honored the instant the D1 hash flips.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string; endpoint_id: string }> },
) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyJWT(token);
    if (payload?.type !== "access")
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { client_id, endpoint_id } = await params;
    const db = await getDatabase();

    const ep = await getAppWebhookEndpoint(db, endpoint_id);
    if (!ep || ep.client_id !== client_id)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    const owner = await db
        .prepare("SELECT owner_id FROM oauth_clients WHERE client_id = ?")
        .bind(client_id)
        .first<{ owner_id: string }>();
    if (!owner || owner.owner_id !== payload.sub)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { plaintext, hash } = await mintWebhookSecret();

    try {
        const kv = (getRequestContext().env as any).KV as KVNamespace;
        await kv.put(`webhook_secret:${endpoint_id}`, plaintext);
    } catch (err) {
        console.error("[endpoint rotate] KV write failed:", err);
        return NextResponse.json(
            { error: "Secret store unavailable; retry" },
            { status: 503 },
        );
    }

    const ok = await rotateAppWebhookEndpointSecret(
        db,
        endpoint_id,
        payload.sub,
        hash,
    );
    if (!ok) {
        // Best-effort KV rollback so subsequent rotates aren't poisoned by
        // a leftover plaintext that the D1 hash never accepted.
        try {
            const kv = (getRequestContext().env as any).KV as KVNamespace;
            await kv.delete(`webhook_secret:${endpoint_id}`);
        } catch {
            /* swallow */
        }
        return NextResponse.json({ error: "Rotation failed" }, { status: 500 });
    }

    return NextResponse.json({
        endpoint_id,
        webhook_secret: plaintext,
        rotated_at: new Date().toISOString(),
        _notice:
            "Store this secret. It will NOT be retrievable. The previous secret is now invalid.",
    });
}
