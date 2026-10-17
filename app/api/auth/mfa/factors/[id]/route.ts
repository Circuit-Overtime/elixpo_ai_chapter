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
 * DELETE /api/auth/mfa/factors/[id]
 *
 * Remove an enrolled factor. If this is the last confirmed factor AND
 * MFA is currently enabled, we refuse — the user must disable MFA first
 * (which goes through /api/auth/mfa/disable, which requires a fresh
 * challenge). Without this guard, deleting your last factor while MFA is
 * enabled would lock you out.
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

    // Look up the factor + the user's enable status + total confirmed factor
    // count in one shot to make the lockout-guard logic obvious.
    const [factorRes, userRes, countRes] = await db.batch([
        db
            .prepare(
                "SELECT id, user_id FROM user_mfa_factors WHERE id = ? AND user_id = ?",
            )
            .bind(id, auth.sub),
        db.prepare("SELECT mfa_enabled FROM users WHERE id = ?").bind(auth.sub),
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM user_mfa_factors
                 WHERE user_id = ? AND confirmed_at IS NOT NULL`,
            )
            .bind(auth.sub),
    ]);

    const factor = (factorRes.results || [])[0] as { id: string } | undefined;
    if (!factor)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mfaEnabled = !!((userRes.results || [])[0] as any)?.mfa_enabled;
    const confirmedCount = ((countRes.results || [])[0] as any)?.n ?? 0;

    if (mfaEnabled && confirmedCount <= 1) {
        return NextResponse.json(
            {
                error: "This is your last 2FA method. Disable 2FA first, then remove the factor.",
            },
            { status: 409 },
        );
    }

    await db
        .prepare("DELETE FROM user_mfa_factors WHERE id = ? AND user_id = ?")
        .bind(id, auth.sub)
        .run();

    return NextResponse.json({ deleted: true });
}
