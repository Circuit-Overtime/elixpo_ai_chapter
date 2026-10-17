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
 * POST /api/auth/mfa/disable
 *
 * Turn 2FA OFF. We DON'T delete factors or backup codes — leaving them
 * in place means re-enabling later doesn't require re-enrolling the
 * authenticator. The user can explicitly DELETE factors via
 * /api/auth/mfa/factors/[id] if they want them gone.
 *
 * Blocked if the user is in the ≥3-apps-mandatory cohort: disabling 2FA
 * while owning 3+ OAuth apps would leave the account locked out of its
 * own management surface on next login.
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const appCount = (await db
        .prepare(
            `SELECT COUNT(*) AS n FROM oauth_clients
             WHERE owner_id = ? AND is_active = 1`,
        )
        .bind(auth.sub)
        .first()) as { n: number } | null;
    if (appCount && appCount.n >= 3) {
        return NextResponse.json(
            {
                error: "2FA is required while you own 3 or more OAuth apps. Delete some apps first, then disable 2FA.",
            },
            { status: 409 },
        );
    }

    await db
        .prepare("UPDATE users SET mfa_enabled = 0 WHERE id = ?")
        .bind(auth.sub)
        .run();

    return NextResponse.json({ enabled: false });
}
