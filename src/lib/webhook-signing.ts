/**
 * Webhook request signing — Stripe-style HMAC over the raw request body.
 *
 * The caller signs each request with the parent product's shared secret and
 * sends the result in a header:
 *
 *     X-Elixpo-Signature: t=<unix_seconds>,v1=<hex hmac-sha256>
 *
 * where the signed payload is  `${t}.${rawBody}`  (the timestamp, a literal
 * dot, then the exact bytes of the JSON body). Binding the timestamp into the
 * signature lets us reject replays outside a tolerance window; signing the raw
 * body guarantees integrity.
 *
 * We verify against the current secret and, during a rotation grace window,
 * the previous one — so secret rotation never drops live traffic.
 */

import { hmacSha256Hex, timingSafeEqual } from "./crypto";

export const SIGNATURE_HEADER = "x-elixpo-signature";
/** Max allowed clock skew between the caller's `t` and our clock. */
export const TOLERANCE_SECONDS = 300;

export interface ParsedSignature {
    t: number;
    v1: string;
}

/** Parse a `t=...,v1=...` header. Returns null if malformed. */
export function parseSignatureHeader(header: string | null): ParsedSignature | null {
    if (!header) return null;
    let t: number | null = null;
    let v1: string | null = null;
    for (const part of header.split(",")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (k === "t") {
            const n = Number.parseInt(val, 10);
            if (Number.isFinite(n)) t = n;
        } else if (k === "v1") {
            v1 = val;
        }
    }
    if (t === null || !v1) return null;
    return { t, v1 };
}

/** Compute the signature a caller should send for this timestamp + body. */
export async function computeSignature(
    secret: string,
    timestamp: number,
    rawBody: string,
): Promise<string> {
    return hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
}

export type SignatureFailure =
    | "missing_signature"
    | "malformed_signature"
    | "timestamp_out_of_tolerance"
    | "invalid_signature";

export interface VerifyResult {
    ok: boolean;
    reason?: SignatureFailure;
}

export interface VerifyOptions {
    /** Current secret (required). */
    secret: string;
    /** Previous secret, still valid during the rotation grace window. */
    prevSecret?: string | null;
    /** Whether the previous secret's grace window is still open. */
    prevValid?: boolean;
    /** Override the clock (unix seconds) — for tests. Defaults to now. */
    nowSeconds?: number;
    toleranceSeconds?: number;
}

/**
 * Verify a parsed signature against the raw body. Checks timestamp tolerance
 * first (cheap, replay guard), then the HMAC against the current secret and —
 * if still in grace — the previous one.
 */
export async function verifySignature(
    sig: ParsedSignature,
    rawBody: string,
    opts: VerifyOptions,
): Promise<VerifyResult> {
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    const tolerance = opts.toleranceSeconds ?? TOLERANCE_SECONDS;
    if (Math.abs(now - sig.t) > tolerance) {
        return { ok: false, reason: "timestamp_out_of_tolerance" };
    }

    const candidate = sig.v1.toLowerCase();
    const expected = (await computeSignature(opts.secret, sig.t, rawBody)).toLowerCase();
    if (timingSafeEqual(expected, candidate)) return { ok: true };

    if (opts.prevSecret && opts.prevValid) {
        const expectedPrev = (
            await computeSignature(opts.prevSecret, sig.t, rawBody)
        ).toLowerCase();
        if (timingSafeEqual(expectedPrev, candidate)) return { ok: true };
    }
    return { ok: false, reason: "invalid_signature" };
}
