/**
 * Dashboard session — a signed cookie (`mail_session`) issued after the user
 * authenticates through Elixpo Accounts SSO. Independent of the Accounts access
 * token lifetime so the tenant stays logged in for the session window.
 *
 * Format: base64url(JSON(payload)) + "." + HMAC_SHA256_hex(SESSION_SECRET, body)
 */

import type { NextRequest } from "next/server";
import { base64url, base64urlDecode, hmacSha256Hex, timingSafeEqual } from "./crypto";
import { getEnv, requireEnv } from "./env";

export const SESSION_COOKIE = "mail_session";
export const SESSION_TTL_SECONDS = 30 * 86400;

export interface SessionData {
    uid: string; // Elixpo Accounts subject
    email: string;
    name?: string;
    avatar?: string | null;
    tenantId: string; // the *active* workspace
    role?: string; // the user's role in the active workspace (owner|admin|writer|viewer)
    iat: number;
    exp: number;
}

/** The active workspace role, defaulting to owner for legacy single-owner cookies. */
export function sessionRole(s: { role?: string } | null): string {
    return s?.role || "owner";
}

export async function signSession(
    data: Omit<SessionData, "iat" | "exp">,
    ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
    const secret = await requireEnv("ELIXPO_MAIL_SESSION_SECRET");
    const now = Math.floor(Date.now() / 1000);
    const full: SessionData = { ...data, iat: now, exp: now + ttlSeconds };
    const body = base64url(JSON.stringify(full));
    const sig = await hmacSha256Hex(secret, body);
    return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined): Promise<SessionData | null> {
    if (!token) return null;
    const secret = await getEnv("ELIXPO_MAIL_SESSION_SECRET");
    if (!secret) return null;

    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const expected = await hmacSha256Hex(secret, body);
    if (!timingSafeEqual(expected, sig)) return null;

    try {
        const data = JSON.parse(base64urlDecode(body)) as SessionData;
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch {
        return null;
    }
}

export async function getSession(request: NextRequest): Promise<SessionData | null> {
    return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}
