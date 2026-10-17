export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { hashBackupCode } from "@/lib/mfa-utils";

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
 * POST /api/auth/mfa/email-otp/confirm
 *
 * Verify the OTP that /enroll mailed, set confirmed_at on the pending
 * factor row, and burn the KV entry so the code can't be replayed.
 *
 * Body: { factor_id, code }.
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
            `SELECT id FROM user_mfa_factors
             WHERE id = ? AND user_id = ? AND kind = 'email_otp'
                AND confirmed_at IS NULL`,
        )
        .bind(factor_id, auth.sub)
        .first()) as { id: string } | null;
    if (!factor) {
        return NextResponse.json(
            { error: "No pending email-OTP enrollment found" },
            { status: 404 },
        );
    }

    const kv = (getRequestContext().env as any).KV as KVNamespace;
    const stored = await kv.get(`mfa_email_enroll:${auth.sub}`);
    if (!stored) {
        return NextResponse.json(
            {
                error: "Verification code expired. Request a new one.",
            },
            { status: 410 },
        );
    }
    const supplied = await hashBackupCode(code.trim());
    if (supplied !== stored) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Burn the OTP before flipping confirmed_at — if the D1 write fails
    // we'd rather the user re-enroll than have the code valid twice.
    await kv.delete(`mfa_email_enroll:${auth.sub}`);
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
