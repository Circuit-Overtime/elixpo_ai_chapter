/**
 * MFA primitives shared across factor kinds.
 *
 * - Backup codes: 8 single-use codes minted at enable-time. Plaintext is
 *   shown once; only the SHA-256 hash sits in D1. Verification is
 *   constant-time at the cost of one indexed scan per attempt.
 *
 * - mfaChallengeToken: short-lived JWT bound to a user_id that proves
 *   "this caller has just passed the first factor". The browser carries
 *   it from /login → /mfa → /api/auth/mfa/challenge/verify. 5-minute TTL
 *   so a stolen first-factor pass can't be re-used long after the user
 *   abandoned the flow.
 */

import * as jose from "jose";
import {
    type JWTPayload as BaseJWTPayload,
    getSigningKey,
    getVerifyingKey,
} from "./jwt";

// ── Backup codes ────────────────────────────────────────────────────────

const BACKUP_CODE_COUNT = 8;
// 10-char alphanumeric, excluding ambiguous (0/O, 1/l/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const bytes = new Uint8Array(10);
        crypto.getRandomValues(bytes);
        let code = "";
        for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
        // Format as XXXXX-XXXXX — easier to copy out of an email or paste.
        out.push(`${code.slice(0, 5)}-${code.slice(5)}`);
    }
    return out;
}

export async function hashBackupCode(plaintext: string): Promise<string> {
    // Normalize formatting before hashing so the user can paste with or
    // without the hyphen / any case.
    const normalized = plaintext.replace(/-/g, "").toUpperCase();
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
    );
    let hex = "";
    for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, "0");
    return hex;
}

// ── MFA challenge token (first-factor → second-factor handoff) ──────────

const CHALLENGE_TOKEN_TTL_MIN = 5;

export interface MfaChallengePayload extends BaseJWTPayload {
    type: "access" | "refresh"; // not used; jose union demands it
    mfa: true;
    user_id: string;
    // Optional: remember intended post-login redirect (e.g. /oauth/authorize?...)
    next?: string;
}

export async function mintMfaChallengeToken(
    userId: string,
    next?: string,
): Promise<string> {
    const key = await getSigningKey();
    const payload: Record<string, unknown> = {
        sub: userId,
        email: "",
        type: "access",
        mfa: true,
        user_id: userId,
    };
    if (next) payload.next = next;
    return new jose.SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA" })
        .setIssuedAt()
        .setExpirationTime(`${CHALLENGE_TOKEN_TTL_MIN}m`)
        .sign(key);
}

export async function verifyMfaChallengeToken(
    token: string,
): Promise<{ userId: string; next?: string } | null> {
    try {
        const key = await getVerifyingKey();
        const { payload } = await jose.jwtVerify(token, key, {
            algorithms: ["EdDSA"],
        });
        const p = payload as any;
        if (p.mfa !== true || typeof p.user_id !== "string") return null;
        return {
            userId: p.user_id,
            next: typeof p.next === "string" ? p.next : undefined,
        };
    } catch {
        return null;
    }
}
