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
 * GET /api/auth/mfa/factors
 *
 * Returns every enrolled factor for the caller, scrubbed of secret
 * material. Plus the user's mfa_enabled flag, the count of unused backup
 * codes, and the count of OAuth apps owned (so the UI can show the
 * 2FA-mandatory banner when ≥3).
 */
export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const db = await getDatabase();

    const [factorsRes, userRes, backupRes, appsRes] = await db.batch([
        db
            .prepare(
                `SELECT id, kind, name, created_at, confirmed_at, last_used_at
                 FROM user_mfa_factors
                 WHERE user_id = ?
                 ORDER BY created_at ASC`,
            )
            .bind(auth.sub),
        db.prepare("SELECT mfa_enabled FROM users WHERE id = ?").bind(auth.sub),
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM user_mfa_backup_codes
                 WHERE user_id = ? AND used_at IS NULL`,
            )
            .bind(auth.sub),
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM oauth_clients
                 WHERE owner_id = ? AND is_active = 1`,
            )
            .bind(auth.sub),
    ]);

    // Dedupe pending duplicates: if a confirmed row exists for a given
    // kind (TOTP / email_otp), drop any pending rows of the same kind
    // from the response. They're remnants of half-finished enrollments
    // and would otherwise show as "pending confirmation" rows the user
    // can't action — clicking Resend just hits the already_confirmed
    // branch and silently no-ops.
    const rawFactors = (factorsRes.results || []) as Array<{
        id: string;
        kind: string;
        name: string | null;
        created_at: string;
        confirmed_at: string | null;
        last_used_at: string | null;
    }>;
    const confirmedKinds = new Set(
        rawFactors.filter((f) => f.confirmed_at).map((f) => f.kind),
    );
    const factors = rawFactors
        .filter((f) => f.confirmed_at || !confirmedKinds.has(f.kind))
        .map((f) => ({
            id: f.id,
            kind: f.kind,
            name: f.name,
            created_at: f.created_at,
            confirmed: !!f.confirmed_at,
            last_used_at: f.last_used_at,
        }));
    const mfaEnabled = !!((userRes.results || [])[0] as any)?.mfa_enabled;
    const unusedBackupCodes = ((backupRes.results || [])[0] as any)?.n ?? 0;
    const ownedAppsCount = ((appsRes.results || [])[0] as any)?.n ?? 0;

    return NextResponse.json({
        mfa_enabled: mfaEnabled,
        unused_backup_codes: unusedBackupCodes,
        owned_apps_count: ownedAppsCount,
        mfa_required: ownedAppsCount >= 3 && !mfaEnabled,
        factors,
    });
}
