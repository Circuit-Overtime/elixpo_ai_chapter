export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
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
 * GET /api/auth/connected-services
 * Returns list of OAuth apps the current user has authorized (has active refresh tokens for).
 */
export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const db = await getDatabase();

        const result = await db
            .prepare(
                `SELECT DISTINCT
           oc.client_id,
           oc.name,
           oc.description,
           oc.homepage_url,
           oc.logo_url,
           oc.client_type,
           MIN(rt.created_at) as first_authorized,
           MAX(rt.created_at) as last_authorized
         FROM refresh_tokens rt
         JOIN oauth_clients oc ON rt.client_id = oc.client_id
         WHERE rt.user_id = ? AND rt.revoked = 0 AND oc.is_active = 1
         GROUP BY oc.client_id
         ORDER BY last_authorized DESC`,
            )
            .bind(auth.sub)
            .all();

        return NextResponse.json({
            services: result.results || [],
        });
    } catch (err) {
        console.error("[Connected Services] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch connected services" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/auth/connected-services?client_id=cli_xxx
 * Revokes all refresh tokens for a specific OAuth app, effectively disconnecting it.
 */
export async function DELETE(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientId = request.nextUrl.searchParams.get("client_id");
    if (!clientId) {
        return NextResponse.json(
            { error: "client_id is required" },
            { status: 400 },
        );
    }

    try {
        const db = await getDatabase();
        await db
            .prepare(
                `UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND client_id = ?`,
            )
            .bind(auth.sub, clientId)
            .run();

        // Notify the app to purge the user's data (first-party apps only).
        const { fireRevocationWebhook } = await import(
            "@/lib/revocation-webhook"
        );
        await fireRevocationWebhook(clientId, auth.sub, "app.revoked");

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Connected Services] Revoke error:", err);
        return NextResponse.json(
            { error: "Failed to revoke access" },
            { status: 500 },
        );
    }
}
