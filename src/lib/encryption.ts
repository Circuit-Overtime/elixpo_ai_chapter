/**
 * Authenticated encryption for secrets at rest (sender app passwords).
 * AES-256-GCM via the Web Crypto API — edge-safe (Workers/Pages/Node 20+).
 *
 * Key: ELIXPO_MAIL_ENCRYPTION_KEY, a 32-byte key as base64 (preferred,
 * `openssl rand -base64 32`) or hex (64 chars). Ciphertext is stored as
 * base64(iv ‖ ciphertext+tag); the 12-byte random IV is prepended.
 *
 * NEVER log or return decrypted secrets.
 */

import { requireEnv } from "./env";

const IV_BYTES = 12;

function decodeKey(raw: string): Uint8Array {
    const s = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
        return bytes;
    }
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length !== 32) {
        throw new Error("ELIXPO_MAIL_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)");
    }
    return bytes;
}

async function getKey(): Promise<CryptoKey> {
    const raw = await requireEnv("ELIXPO_MAIL_ENCRYPTION_KEY");
    return crypto.subtle.importKey(
        "raw",
        decodeKey(raw) as unknown as BufferSource,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
    );
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/** Encrypt a UTF-8 string. Returns base64(iv ‖ ciphertext). */
export async function encryptSecret(plaintext: string): Promise<string> {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext),
    );
    const ctBytes = new Uint8Array(ct);
    const combined = new Uint8Array(iv.length + ctBytes.length);
    combined.set(iv, 0);
    combined.set(ctBytes, iv.length);
    return bytesToBase64(combined);
}

/** Decrypt a value produced by encryptSecret(). */
export async function decryptSecret(payload: string): Promise<string> {
    const key = await getKey();
    const combined = base64ToBytes(payload);
    const iv = combined.slice(0, IV_BYTES);
    const ct = combined.slice(IV_BYTES);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
}
