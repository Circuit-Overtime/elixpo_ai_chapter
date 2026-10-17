/**
 * Checkout handoff token — the signed payload blogs.elixpo (and any future
 * consumer) hands Elixpo Pay when redirecting a user to /checkout.
 *
 * ── Contract (shared with the consuming app) ────────────────────────────────
 * The app redirects to:
 *   https://payouts.elixpo.com/checkout?token=<HANDOFF>
 *   (it may also append human-readable app/plan/uid/amount params, but the
 *    token is the ONLY trusted source — never the loose query params, so a
 *    user can't tamper with the amount.)
 *
 * HANDOFF = base64url(JSON(payload)) + "." + HMAC_SHA256_hex(secret, body)
 *   where `body` is the base64url(JSON(payload)) string, and `secret` is the
 *   shared ELIXPO_PAY_HANDOFF_SECRET.
 *
 * payload = {
 *   app:      "lixblogs",        // app slug (must match an apps.slug)
 *   plan:     "member",          // product tier being purchased
 *   uid:      "<app user id>",   // the buyer in the app's namespace
 *   currency: "INR",
 *   amount:   19900,             // minor units (paise) — authoritative
 *   return:   "https://blogs.elixpo.com/pricing", // post-checkout redirect
 *   email?:   "buyer@x.com",     // optional, prefilled in checkout
 *   iat:      <unix seconds>,
 *   exp:      <unix seconds>     // short-lived (e.g. +30 min)
 * }
 */

import {
    base64url,
    base64urlDecode,
    hmacSha256Hex,
    timingSafeEqual,
} from "./crypto";

export interface HandoffPayload {
    app: string;
    plan: string;
    uid: string;
    currency: string;
    amount: number;
    return?: string;
    email?: string;
    iat: number;
    exp: number;
}

export async function signHandoff(
    secret: string,
    payload: Omit<HandoffPayload, "iat" | "exp">,
    ttlSeconds = 1800,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const full: HandoffPayload = {
        ...payload,
        iat: now,
        exp: now + ttlSeconds,
    };
    const body = base64url(JSON.stringify(full));
    const sig = await hmacSha256Hex(secret, body);
    return `${body}.${sig}`;
}

export type HandoffResult =
    | { ok: true; payload: HandoffPayload }
    | { ok: false; error: string };

export async function verifyHandoff(
    secret: string,
    token: string,
): Promise<HandoffResult> {
    const dot = token.lastIndexOf(".");
    if (dot < 1) return { ok: false, error: "malformed_token" };

    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const expected = await hmacSha256Hex(secret, body);
    if (!timingSafeEqual(expected, sig)) {
        return { ok: false, error: "bad_signature" };
    }

    let payload: HandoffPayload;
    try {
        payload = JSON.parse(base64urlDecode(body));
    } catch {
        return { ok: false, error: "bad_payload" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) {
        return { ok: false, error: "expired" };
    }
    if (!payload.app || !payload.uid || !payload.amount || !payload.currency) {
        return { ok: false, error: "incomplete_payload" };
    }

    return { ok: true, payload };
}
