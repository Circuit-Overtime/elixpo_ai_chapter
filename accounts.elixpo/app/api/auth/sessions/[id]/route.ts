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
 * DELETE /api/auth/sessions/[id]
 *
 * Sign out a specific session by revoking its refresh_token row. The
 * device's access_token (cached client-side, ≤15min TTL) keeps working
 * until it expires; after that the auto-refresh fails and the device
 * is bounced to /login. Revoking your own current session also works
 * (you get signed out everywhere on this device).
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const db = await getDatabase();

    // Look up the row's fingerprint so we can revoke EVERY session
    // belonging to the same device (the UI shows one row per device;
    // signing out that row should kill all underlying sessions, not
    // just the representative one).
    const target = await db
        .prepare(
            `SELECT ip_hash, ua_short FROM refresh_tokens
             WHERE id = ? AND user_id = ?`,
        )
        .bind(id, auth.sub)
        .first<{ ip_hash: string | null; ua_short: string | null }>();
    if (!target) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // NULL-safe comparison: `IS` works for both real values and NULLs,
    // unlike `=` which never matches NULL.
    const r = await db
        .prepare(
            `UPDATE refresh_tokens
             SET revoked = 1, revoked_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND revoked = 0
                AND ip_hash IS ? AND ua_short IS ?`,
        )
        .bind(auth.sub, target.ip_hash, target.ua_short)
        .run();
    return NextResponse.json({
        revoked: true,
        sessions_revoked: r.meta?.changes ?? 0,
    });
}
