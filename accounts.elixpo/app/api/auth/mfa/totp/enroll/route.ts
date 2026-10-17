export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { generateTotpSecret } from "@/lib/mfa-totp";
import { generateUUID } from "@/lib/webcrypto";

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
 * POST /api/auth/mfa/totp/enroll
 *
 * Start TOTP enrollment. We mint a fresh base32 secret, store it as an
 * UNCONFIRMED factor row (confirmed_at = NULL), and return the secret +
 * the otpauth:// URI for QR rendering. The user scans it, then calls
 * /confirm with the first valid code to flip confirmed_at and unlock
 * the factor for use.
 *
 * Unconfirmed rows older than 30 minutes get garbage-collected on the
 * next enroll attempt — there should never be more than one outstanding
 * enrollment per (user, kind) at a time.
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const user = (await db
        .prepare("SELECT email FROM users WHERE id = ?")
        .bind(auth.sub)
        .first()) as { email: string } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Clean up any prior unconfirmed TOTP enrollment for this user.
    await db
        .prepare(
            `DELETE FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'totp' AND confirmed_at IS NULL`,
        )
        .bind(auth.sub)
        .run();

    const { secret, otpauth_uri } = generateTotpSecret(user.email);
    const factorId = generateUUID();

    await db
        .prepare(
            `INSERT INTO user_mfa_factors
                (id, user_id, kind, name, secret)
             VALUES (?, ?, 'totp', ?, ?)`,
        )
        .bind(factorId, auth.sub, "Authenticator app", secret)
        .run();

    return NextResponse.json({
        factor_id: factorId,
        secret,
        otpauth_uri,
        _notice:
            "Scan this in your authenticator app, then confirm with the first generated code.",
    });
}
