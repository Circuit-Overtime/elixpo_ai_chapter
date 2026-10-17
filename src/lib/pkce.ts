const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function isValidPkceValue(value: string): boolean {
    return PKCE_VALUE.test(value);
}

export async function deriveS256CodeChallenge(
    verifier: string,
): Promise<string> {
    if (!isValidPkceValue(verifier)) {
        throw new Error("Invalid PKCE code verifier");
    }
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return base64Url(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string): boolean {
    const maxLength = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;
    for (let index = 0; index < maxLength; index += 1) {
        difference |=
            (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }
    return difference === 0;
}

export async function verifyS256CodeChallenge(
    verifier: string,
    challenge: string,
): Promise<boolean> {
    if (!isValidPkceValue(verifier) || !isValidPkceValue(challenge)) {
        return false;
    }
    return constantTimeEqual(
        await deriveS256CodeChallenge(verifier),
        challenge,
    );
}
