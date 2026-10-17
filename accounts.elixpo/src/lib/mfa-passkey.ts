/**
 * WebAuthn / passkey helpers — thin wrapper over @simplewebauthn/server.
 *
 * Challenges live in KV with a 5-minute TTL, keyed per user (registration)
 * or per mfa-challenge-token (authentication). The browser carries the
 * server-returned options to the authenticator, gets a signed response
 * back, and we verify it against the stored challenge + the user's
 * enrolled credential.
 *
 * Public-key bytes and credential IDs are stored as base64url strings —
 * D1 holds the encoded form, the verifier converts back at use time.
 */

import {
    type AuthenticationResponseJSON,
    generateAuthenticationOptions,
    generateRegistrationOptions,
    type RegistrationResponseJSON,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";

const RP_NAME = "Elixpo Accounts";
const CHALLENGE_TTL_SECONDS = 5 * 60;

function getRpId(): string {
    // Effective domain (no scheme, no path). Localhost is allowed by spec.
    try {
        const url = new URL(
            process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com",
        );
        return url.hostname;
    } catch {
        return "accounts.elixpo.com";
    }
}

function getOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com"
    ).replace(/\/$/, "");
}

// ── Challenge storage (KV) ──────────────────────────────────────────────

export interface ChallengeStore {
    put(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<void>;
}

export function kvChallengeStore(kv: KVNamespace): ChallengeStore {
    return {
        put: (k, v) =>
            kv
                .put(k, v, { expirationTtl: CHALLENGE_TTL_SECONDS })
                .then(() => {}),
        get: (k) => kv.get(k),
        del: (k) => kv.delete(k).then(() => {}),
    };
}

// ── Registration ────────────────────────────────────────────────────────

export interface RegistrationOptionsArgs {
    userId: string;
    userEmail: string;
    userDisplayName: string;
    existingCredentialIds: string[]; // b64url strings already enrolled
}

export async function buildRegistrationOptions(
    args: RegistrationOptionsArgs,
    store: ChallengeStore,
) {
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: getRpId(),
        userName: args.userEmail,
        userID: new TextEncoder().encode(args.userId),
        userDisplayName: args.userDisplayName,
        attestationType: "none",
        excludeCredentials: args.existingCredentialIds.map((id) => ({
            id,
            transports: ["internal", "usb", "ble", "nfc", "hybrid"],
        })),
        authenticatorSelection: {
            // Platform + cross-platform both fine; let user pick.
            residentKey: "preferred",
            userVerification: "preferred",
        },
    });

    await store.put(`webauthn_reg:${args.userId}`, options.challenge);
    return options;
}

export interface VerifiedRegistration {
    credentialId: string; // b64url
    publicKey: string; // b64url COSE
    signCount: number;
    transports: string[];
}

export async function verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    store: ChallengeStore,
): Promise<VerifiedRegistration | null> {
    const expectedChallenge = await store.get(`webauthn_reg:${userId}`);
    if (!expectedChallenge) return null;

    // Derive the type from the function instead of importing it — keeps
    // the file decoupled from @simplewebauthn/server's type exports
    // (they've shifted between versions).
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
        verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigin(),
            expectedRPID: getRpId(),
            requireUserVerification: false,
        });
    } catch (err) {
        console.error(
            "[mfa-passkey] registration verify threw: %s",
            err instanceof Error ? err.message : String(err),
        );
        return null;
    }
    // One-shot — burn the challenge regardless of outcome.
    await store.del(`webauthn_reg:${userId}`);

    if (!verification.verified || !verification.registrationInfo) return null;
    const info = verification.registrationInfo;
    return {
        credentialId: info.credential.id,
        publicKey: bytesToB64Url(info.credential.publicKey),
        signCount: info.credential.counter,
        transports: (response.response.transports as string[]) || [],
    };
}

// ── Authentication ──────────────────────────────────────────────────────

export async function buildAuthenticationOptions(
    challengeId: string,
    allowedCredentialIds: string[],
    store: ChallengeStore,
) {
    const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        allowCredentials: allowedCredentialIds.map((id) => ({
            id,
            transports: ["internal", "usb", "ble", "nfc", "hybrid"],
        })),
        userVerification: "preferred",
    });
    await store.put(`webauthn_auth:${challengeId}`, options.challenge);
    return options;
}

export interface StoredCredential {
    credentialId: string; // b64url
    publicKey: string; // b64url COSE
    signCount: number;
    transports?: string[];
}

export interface VerifiedAuthentication {
    newSignCount: number;
    credentialId: string;
}

export async function verifyAuthentication(
    challengeId: string,
    response: AuthenticationResponseJSON,
    credential: StoredCredential,
    store: ChallengeStore,
): Promise<VerifiedAuthentication | null> {
    const expectedChallenge = await store.get(`webauthn_auth:${challengeId}`);
    if (!expectedChallenge) return null;

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigin(),
            expectedRPID: getRpId(),
            credential: {
                id: credential.credentialId,
                publicKey: b64UrlToBytes(credential.publicKey),
                counter: credential.signCount,
                transports: (credential.transports as any) || undefined,
            },
            requireUserVerification: false,
        });
    } catch (err) {
        console.error(
            "[mfa-passkey] auth verify threw: %s",
            err instanceof Error ? err.message : String(err),
        );
        return null;
    }
    await store.del(`webauthn_auth:${challengeId}`);

    if (!verification.verified) return null;
    return {
        newSignCount: verification.authenticationInfo.newCounter,
        credentialId: credential.credentialId,
    };
}

// ── base64url helpers ───────────────────────────────────────────────────

function bytesToB64Url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    // Allocate over a fresh ArrayBuffer (not SharedArrayBuffer) so the
    // returned type matches the strict ArrayBuffer-backed Uint8Array
    // that @simplewebauthn/server expects in v13.
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
