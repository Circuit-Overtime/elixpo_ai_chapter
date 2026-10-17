/**
 * Edge-safe crypto helpers built on the Web Crypto API (works in Workers,
 * Pages, and Node 20+). No Node `crypto` import so it runs on the edge runtime.
 * Mirrors mail.elixpo's crypto helpers.
 */

const encoder = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function base64url(input: ArrayBuffer | string): string {
    const bytes =
        typeof input === "string"
            ? encoder.encode(input)
            : new Uint8Array(input);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(input: string): string {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return atob(b64 + pad);
}

export async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
    return toHex(digest);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

/** HMAC-SHA256 of `message` with `secret`, hex-encoded. */
export async function hmacSha256Hex(
    secret: string,
    message: string,
): Promise<string> {
    const key = await importHmacKey(secret);
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return toHex(sig);
}

/** Constant-time comparison of two strings of equal expected length. */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Random url-safe token, `bytes` of entropy (default 32). */
export function randomToken(bytes = 32): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return base64url(buf.buffer);
}
