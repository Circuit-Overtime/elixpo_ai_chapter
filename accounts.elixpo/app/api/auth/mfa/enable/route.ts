export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { generateBackupCodes, hashBackupCode } from "@/lib/mfa-utils";
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
 * POST /api/auth/mfa/enable
 *
 * Flip users.mfa_enabled to 1 + mint a fresh set of backup codes. The
 * plaintext codes are returned ONCE in the response; the user must save
 * them. Subsequent reads via /api/auth/mfa/factors only expose the
 * count of unused codes.
 *
 * Pre-conditions:
 *   - ≥1 confirmed factor (TOTP confirmed, passkey verified, or email_otp).
 *
 * Safe to call repeatedly: each call invalidates any previous batch of
 * backup codes (the rotate-on-enable semantic).
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const [factorCountRow, userRow, codeCountRow] = await db.batch([
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM user_mfa_factors
                 WHERE user_id = ? AND confirmed_at IS NOT NULL`,
            )
            .bind(auth.sub),
        db.prepare("SELECT mfa_enabled FROM users WHERE id = ?").bind(auth.sub),
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM user_mfa_backup_codes
                 WHERE user_id = ? AND used_at IS NULL`,
            )
            .bind(auth.sub),
    ]);

    const factorCount =
        ((factorCountRow.results || [])[0] as { n: number } | undefined)?.n ??
        0;
    if (factorCount < 1) {
        return NextResponse.json(
            {
                error: "Enroll at least one 2FA method before enabling 2FA.",
            },
            { status: 400 },
        );
    }

    // Idempotent: if 2FA is already on, return success WITHOUT rotating
    // backup codes. Auto-enable (client-side, on first factor confirm)
    // calls this on every confirm; without this short-circuit it would
    // invalidate the user's saved codes every time they enroll a second
    // method.
    const alreadyEnabled = !!(
        (userRow.results || [])[0] as { mfa_enabled: number } | undefined
    )?.mfa_enabled;
    if (alreadyEnabled) {
        return NextResponse.json({
            enabled: true,
            already_enabled: true,
            unused_backup_codes:
                ((codeCountRow.results || [])[0] as { n: number } | undefined)
                    ?.n ?? 0,
        });
    }

    // First-time enable — mint fresh codes; invalidate any leftover
    // batch (defensive — there shouldn't be any) atomically with the
    // flag flip.
    const plain = generateBackupCodes();
    const hashes = await Promise.all(plain.map(hashBackupCode));

    const ops = [
        db
            .prepare("UPDATE users SET mfa_enabled = 1 WHERE id = ?")
            .bind(auth.sub),
        db
            .prepare("DELETE FROM user_mfa_backup_codes WHERE user_id = ?")
            .bind(auth.sub),
        ...hashes.map((h) =>
            db
                .prepare(
                    `INSERT INTO user_mfa_backup_codes
                        (id, user_id, code_hash)
                     VALUES (?, ?, ?)`,
                )
                .bind(generateUUID(), auth.sub, h),
        ),
    ];
    await db.batch(ops);

    return NextResponse.json({
        enabled: true,
        backup_codes: plain,
        _notice:
            "Store these codes somewhere safe. Each is single-use. They will NOT be shown again.",
    });
}
