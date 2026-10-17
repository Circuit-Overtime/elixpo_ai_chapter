export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    buildAuthenticationOptions,
    kvChallengeStore,
} from "@/lib/mfa-passkey";
import { verifyMfaChallengeToken } from "@/lib/mfa-utils";

/**
 * POST /api/auth/mfa/challenge/passkey/options
 *
 * During a login challenge, ask the server for a WebAuthn assertion
 * challenge. allowCredentials is bounded to the user's enrolled passkeys.
 * The browser hands the resulting options to navigator.credentials.get()
 * and forwards the signed response to /challenge/verify with method:"passkey".
 */
export async function POST(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mfaToken = body?.mfaToken;
    if (typeof mfaToken !== "string") {
        return NextResponse.json(
            { error: "mfaToken is required" },
            { status: 400 },
        );
    }

    const challenge = await verifyMfaChallengeToken(mfaToken);
    if (!challenge) {
        return NextResponse.json(
            { error: "mfaToken is invalid or expired" },
            { status: 401 },
        );
    }

    const db = await getDatabase();
    const credsRes = await db
        .prepare(
            `SELECT credential_id FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'passkey'
                AND credential_id IS NOT NULL
                AND confirmed_at IS NOT NULL`,
        )
        .bind(challenge.userId)
        .all<{ credential_id: string }>();
    const credentialIds = (credsRes.results || [])
        .map((r) => r.credential_id)
        .filter(Boolean);

    if (credentialIds.length === 0) {
        return NextResponse.json(
            { error: "No passkeys enrolled" },
            { status: 400 },
        );
    }

    const kv = (getRequestContext().env as any).KV as KVNamespace;
    const options = await buildAuthenticationOptions(
        mfaToken.slice(-32),
        credentialIds,
        kvChallengeStore(kv),
    );
    return NextResponse.json(options);
}
