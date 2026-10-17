export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { logAuditEvent, revokeAllRefreshTokensForUser } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";
import { generateUUID, hashString } from "@/lib/webcrypto";

async function getAuth(request: NextRequest) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJWT(token);
    return payload?.type === "access" ? payload : null;
}

export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDatabase();
    const res = await db
        .prepare(
            `SELECT
                MIN(id) AS id,
                COALESCE(ip_hash, '__none__') AS ip_key,
                COALESCE(ua_short, '__none__') AS ua_key,
                ip_hash,
                ua_short,
                MIN(created_at) AS created_at,
                MAX(COALESCE(last_used_at, created_at)) AS last_used_at,
                MAX(expires_at) AS expires_at,
                COUNT(*) AS session_count
             FROM refresh_tokens
             WHERE user_id = ? AND revoked = 0
                AND expires_at > CURRENT_TIMESTAMP
             GROUP BY ip_key, ua_key
             ORDER BY last_used_at DESC`,
        )
        .bind(auth.sub)
        .all<{
            id: string;
            ip_hash: string | null;
            ua_short: string | null;
            created_at: string;
            last_used_at: string;
            expires_at: string;
            session_count: number;
        }>();

    let currentIp: string | null = null;
    let currentUa: string | null = null;
    const refreshCookie = request.cookies.get("refresh_token")?.value;
    if (refreshCookie) {
        const current = await db
            .prepare(
                `SELECT ip_hash, ua_short FROM refresh_tokens
                 WHERE user_id = ? AND token_hash = ? AND revoked = 0`,
            )
            .bind(auth.sub, await hashString(refreshCookie))
            .first<{ ip_hash: string | null; ua_short: string | null }>();
        currentIp = current?.ip_hash ?? null;
        currentUa = current?.ua_short ?? null;
    }

    return NextResponse.json({
        sessions: (res.results || []).map((row) => ({
            id: row.id,
            device: row.ua_short || "Unknown device",
            ip_hash: row.ip_hash,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
            expires_at: row.expires_at,
            session_count: row.session_count,
            is_current: row.ip_hash === currentIp && row.ua_short === currentUa,
        })),
    });
}

export async function DELETE(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const db = await getDatabase();
    await revokeAllRefreshTokensForUser(db, auth.sub, "account_revoke");
    await logAuditEvent(db, {
        id: generateUUID(),
        userId: auth.sub,
        eventType: "sessions_revoked_all",
        status: "success",
    }).catch(() => {});

    return NextResponse.json({ success: true });
}
