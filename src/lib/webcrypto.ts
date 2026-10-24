export function generateRandomString(length: number = 32): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, length * 2);
}

export async function generatePKCE(): Promise<{
    verifier: string;
    challenge: string;
}> {
    const verifier = generateRandomString(32);
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    return { verifier, challenge };
}

export async function hashString(input: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function generateState(): string {
    return generateRandomString(32);
}

export function generateNonce(): string {
    return generateRandomString(16);
}

export function generateUUID(): string {
    return crypto.randomUUID();
}

/**
 * Cryptographically uniform numeric OTP (default 6 digits), returned as
 * a zero-padded string. Uses DIRECT rejection sampling into the OTP
 * space rather than `getRandomValues() % 10^n`, which would be biased
 * (24-bit sample space isn't a multiple of 1_000_000) and trips
 * CodeQL js/biased-cryptographic-random.
 *
 * Acceptance rate ≈ 6% at 6 digits, average ~17 attempts. Each attempt
 * is a single Web Crypto call (microseconds), so the total stays
 * sub-millisecond even on cold edge invocations. Keeps the surface as a
 * single shared helper so the unbiased pattern can't drift in any one
 * route.
 */
export function generateNumericOtp(digits: number = 6): string {
    const space = 10 ** digits;
    let value: number;
    do {
        const bytes = crypto.getRandomValues(new Uint8Array(3));
        value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    } while (value >= space);
    return value.toString().padStart(digits, "0");
}
