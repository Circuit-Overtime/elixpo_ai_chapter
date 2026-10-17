export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { verifyTotpCode } from "@/lib/mfa-totp";

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
 * POST /api/auth/mfa/totp/confirm
 *
 * Confirm a pending TOTP enrollment by submitting the first valid code.
 * Sets confirmed_at on the factor row so it becomes usable for login
 * challenges (and counts toward the "≥1 confirmed factor" requirement
 * for /api/auth/mfa/enable).
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { factor_id, code } = body as { factor_id?: string; code?: string };
    if (!factor_id || !code) {
        return NextResponse.json(
            { error: "factor_id and code are required" },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const factor = (await db
        .prepare(
            `SELECT id, secret FROM user_mfa_factors
             WHERE id = ? AND user_id = ? AND kind = 'totp'
                AND confirmed_at IS NULL`,
        )
        .bind(factor_id, auth.sub)
        .first()) as { id: string; secret: string } | null;
    if (!factor)
        return NextResponse.json(
            { error: "No pending TOTP enrollment found" },
            { status: 404 },
        );

    if (!verifyTotpCode(factor.secret, code)) {
        return NextResponse.json(
            { error: "Invalid code. Make sure your device time is in sync." },
            { status: 400 },
        );
    }

    await db
        .prepare(
            `UPDATE user_mfa_factors
             SET confirmed_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
        )
        .bind(factor.id)
        .run();

    return NextResponse.json({ confirmed: true, factor_id: factor.id });
}
