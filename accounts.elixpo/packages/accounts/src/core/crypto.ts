import { AccountsError } from "./errors.js";

const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function randomValue(byteLength = 32): string {
    if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 96) {
        throw new AccountsError(
            "configuration_error",
            "Random value length must be between 16 and 96 bytes",
        );
    }
    return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function generateState(): string {
    return randomValue(32);
}

export function generateNonce(): string {
    return randomValue(32);
}

export function generateCodeVerifier(): string {
    return randomValue(32);
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
    if (!PKCE_VALUE.test(verifier)) {
        throw new AccountsError(
            "configuration_error",
            "PKCE verifier must contain 43 to 128 unreserved characters",
        );
    }
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return base64Url(new Uint8Array(digest));
}

export async function generatePkce(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
}> {
    const codeVerifier = generateCodeVerifier();
    return {
        codeVerifier,
        codeChallenge: await deriveCodeChallenge(codeVerifier),
        codeChallengeMethod: "S256",
    };
}

export function timingSafeEqual(left: string, right: string): boolean {
    const maxLength = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;
    for (let index = 0; index < maxLength; index += 1) {
        difference |=
            (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }
    return difference === 0;
}

export function assertState(expected: string, actual: string): void {
    if (!timingSafeEqual(expected, actual)) {
        throw new AccountsError("state_mismatch", "OAuth state did not match");
    }
}

export function assertNonce(expected: string, actual?: string): void {
    if (!actual || !timingSafeEqual(expected, actual)) {
        throw new AccountsError(
            "nonce_mismatch",
            "ID token nonce did not match",
        );
    }
}
