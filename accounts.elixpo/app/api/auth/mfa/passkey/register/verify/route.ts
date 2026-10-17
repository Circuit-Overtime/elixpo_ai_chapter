export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { kvChallengeStore, verifyRegistration } from "@/lib/mfa-passkey";
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
 * POST /api/auth/mfa/passkey/register/verify
 *
 * Verify the authenticator's registration response against the challenge
 * we stored in KV during /options. On success, persist the credential as
 * a confirmed factor immediately — unlike TOTP, WebAuthn enrollment is
 * single-step (the user has already touched/biometric'd at this point).
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
    const { response, name } = body;
    if (!response) {
        return NextResponse.json(
            { error: "response (WebAuthn registration response) is required" },
            { status: 400 },
        );
    }

    const kv = (getRequestContext().env as any).KV as KVNamespace;
    const verified = await verifyRegistration(
        auth.sub,
        response,
        kvChallengeStore(kv),
    );
    if (!verified) {
        return NextResponse.json(
            { error: "Passkey registration verification failed" },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const factorId = generateUUID();
    const safeName =
        typeof name === "string" && name.length > 0 && name.length <= 64
            ? name
            : "Passkey";

    try {
        await db
            .prepare(
                `INSERT INTO user_mfa_factors
                    (id, user_id, kind, name, secret, credential_id,
                     sign_count, transports, confirmed_at, last_used_at)
                 VALUES (?, ?, 'passkey', ?, ?, ?, ?, ?,
                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            )
            .bind(
                factorId,
                auth.sub,
                safeName,
                verified.publicKey,
                verified.credentialId,
                verified.signCount,
                JSON.stringify(verified.transports || []),
            )
            .run();
    } catch (err: any) {
        // Most likely cause: the unique partial index on credential_id
        // tripped — the authenticator was already registered for another
        // user (or under another name for this user; the
        // excludeCredentials hint should have prevented this).
        console.error("[mfa passkey verify] insert failed: %s", err?.message);
        return NextResponse.json(
            { error: "This passkey is already registered" },
            { status: 409 },
        );
    }

    return NextResponse.json({
        confirmed: true,
        factor_id: factorId,
        name: safeName,
    });
}
