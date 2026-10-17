/**
 * Admin session — a signed cookie (`admin_session`) issued only after a user
 * authenticates through Elixpo Accounts SSO AND is confirmed `isAdmin`.
 *
 * Format: base64url(JSON(payload)) + "." + HMAC_SHA256_hex(SESSION_SECRET, body)
 * (signed, not encrypted; the cookie is httpOnly + Secure). We keep the upstream
 * access/refresh tokens in the payload so we can periodically re-verify admin
 * status against accounts.elixpo and refresh when needed.
 */

import type { NextRequest } from "next/server";
import {
    base64url,
    base64urlDecode,
    hmacSha256Hex,
    timingSafeEqual,
} from "./crypto";
import { getEnv, requireEnv } from "./env";

export const SESSION_COOKIE = "admin_session";
export const STATE_COOKIE = "admin_oauth_state";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

export interface SessionData {
    uid: string; // Elixpo Accounts subject / user id
    email: string;
    name?: string;
    avatar?: string | null;
    isAdmin: boolean;
    at?: string; // upstream access token
    rt?: string; // upstream refresh token
    atExp?: number; // access token expiry (unix seconds)
    iat: number;
    exp: number;
}

export async function signSession(
    data: Omit<SessionData, "iat" | "exp">,
    ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
    const secret = await requireEnv("SESSION_SECRET");
    const now = Math.floor(Date.now() / 1000);
    const full: SessionData = { ...data, iat: now, exp: now + ttlSeconds };
    const body = base64url(JSON.stringify(full));
    const sig = await hmacSha256Hex(secret, body);
    return `${body}.${sig}`;
}

export async function verifySession(
    token: string | undefined,
): Promise<SessionData | null> {
    if (!token) return null;
    const secret = await getEnv("SESSION_SECRET");
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

export async function getSession(
    request: NextRequest,
): Promise<SessionData | null> {
    return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * Route guard. Returns the session only if present, valid, and admin.
 * Use at the top of every protected /api handler:
 *   const session = await requireAdmin(request);
 *   if (!session) return unauthorized();
 */
export async function requireAdmin(
    request: NextRequest,
): Promise<SessionData | null> {
    const s = await getSession(request);
    if (!s || !s.isAdmin) return null;
    return s;
}
