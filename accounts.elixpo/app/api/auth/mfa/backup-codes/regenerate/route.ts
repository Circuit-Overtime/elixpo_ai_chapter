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
 * POST /api/auth/mfa/backup-codes/regenerate
 *
 * Mint a fresh set of 8 backup codes, invalidating the old batch. Only
 * usable while 2FA is enabled — there's no point in standalone backup
 * codes.
 *
 * Returns plaintext ONCE. The user is responsible for capturing them.
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const user = (await db
        .prepare("SELECT mfa_enabled FROM users WHERE id = ?")
        .bind(auth.sub)
        .first()) as { mfa_enabled: number } | null;
    if (!user?.mfa_enabled) {
        return NextResponse.json(
            { error: "Enable 2FA before generating backup codes." },
            { status: 400 },
        );
    }

    const plain = generateBackupCodes();
    const hashes = await Promise.all(plain.map(hashBackupCode));
    const ops = [
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
        backup_codes: plain,
        _notice:
            "Old backup codes are invalidated. Save these new ones — they will NOT be shown again.",
    });
}
