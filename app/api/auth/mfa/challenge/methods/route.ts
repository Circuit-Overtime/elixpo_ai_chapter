export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyMfaChallengeToken } from "@/lib/mfa-utils";

/**
 * GET /api/auth/mfa/challenge/methods?token=<mfaToken>
 *
 * Returns the second-factor methods the user has actually enrolled, so
 * the /mfa page can render only the buttons that will work. Without
 * this, OAuth-callback users (whose server-side redirect can't easily
 * embed methods in the URL) would see every possible method including
 * ones they haven't set up — and clicking those would just fail.
 *
 * Backup_code is always included if the user has at least one unused
 * code, even though it isn't a "factor" per se — it's the recovery path
 * and we want it accessible at challenge time.
 *
 * Public-ish endpoint: gated only by the mfaToken (which proves the
 * user passed the first factor). No access_token required because the
 * caller doesn't have one yet — that's the whole point.
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
        return NextResponse.json(
            { error: "token query parameter is required" },
            { status: 400 },
        );
    }
    const challenge = await verifyMfaChallengeToken(token);
    if (!challenge) {
        return NextResponse.json(
            { error: "mfaToken is invalid or expired" },
            { status: 401 },
        );
    }

    const db = await getDatabase();
    const [factorsRes, codesRes] = await db.batch([
        db
            .prepare(
                `SELECT kind FROM user_mfa_factors
                 WHERE user_id = ? AND confirmed_at IS NOT NULL`,
            )
            .bind(challenge.userId),
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM user_mfa_backup_codes
                 WHERE user_id = ? AND used_at IS NULL`,
            )
            .bind(challenge.userId),
    ]);

    const kinds = new Set(
        ((factorsRes.results || []) as Array<{ kind: string }>).map(
            (r) => r.kind,
        ),
    );
    const unusedCodes =
        ((codesRes.results || [])[0] as { n: number } | undefined)?.n ?? 0;

    const methods: string[] = [];
    if (kinds.has("passkey")) methods.push("passkey");
    if (kinds.has("totp")) methods.push("totp");
    if (kinds.has("email_otp")) methods.push("email_otp");
    if (unusedCodes > 0) methods.push("backup_code");

    return NextResponse.json({ methods });
}
