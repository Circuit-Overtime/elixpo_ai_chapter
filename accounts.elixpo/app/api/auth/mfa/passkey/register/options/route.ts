export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { buildRegistrationOptions, kvChallengeStore } from "@/lib/mfa-passkey";

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
 * POST /api/auth/mfa/passkey/register/options
 *
 * Generate WebAuthn registration challenge. The browser passes this to
 * the authenticator (TouchID, security key, etc.), which produces a
 * signed response we'll verify in /verify. Existing credential IDs go
 * into excludeCredentials so the user can't enroll the same authenticator
 * twice.
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const user = (await db
        .prepare("SELECT email, display_name FROM users WHERE id = ?")
        .bind(auth.sub)
        .first()) as { email: string; display_name: string | null } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

    const existingRes = await db
        .prepare(
            `SELECT credential_id FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'passkey' AND credential_id IS NOT NULL`,
        )
        .bind(auth.sub)
        .all<{ credential_id: string }>();
    const existing = (existingRes.results || [])
        .map((r) => r.credential_id)
        .filter(Boolean);

    const kv = (getRequestContext().env as any).KV as KVNamespace;
    const options = await buildRegistrationOptions(
        {
            userId: auth.sub,
            userEmail: user.email,
            userDisplayName: user.display_name || user.email.split("@")[0],
            existingCredentialIds: existing,
        },
        kvChallengeStore(kv),
    );
    return NextResponse.json(options);
}
