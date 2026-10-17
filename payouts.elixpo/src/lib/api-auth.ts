/**
 * Secret-key authentication for the public server-to-server API (`/v1/*`).
 *
 * Consuming apps authenticate with their per-app secret key (`lix_pay_…`),
 * sent as `Authorization: Bearer <key>` (or `X-Elixpo-Pay-Key`). We never store
 * the key itself — only its SHA-256 — so auth is a hash lookup plus a
 * constant-time compare. This is the Stripe-style model that replaced the old
 * shared HANDOFF/WEBHOOK secrets.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { sha256Hex, timingSafeEqual } from "./crypto";

export interface ApiKeyApp {
    id: string;
    merchant_id: string;
    slug: string;
    name: string;
    api_key_hash: string | null;
    prev_api_key_hash?: string | null;
    prev_api_key_expires_at?: string | null;
    return_url: string | null;
    status: string;
    [key: string]: unknown;
}

/** Pull the secret key off the request (Bearer first, then header). */
export function readApiKey(request: Request): string | null {
    const auth = request.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
    return request.headers.get("x-elixpo-pay-key")?.trim() || null;
}

/** Resolve the active app for the request's secret key, or null. */
export async function appFromApiKey(
    db: D1Database,
    request: Request,
): Promise<ApiKeyApp | null> {
    const key = readApiKey(request);
    if (!key) return null;
    const hash = await sha256Hex(key);
    // Match the current key, or a previous key still inside its grace window.
    const app = (await db
        .prepare(
            `SELECT * FROM apps
             WHERE status = 'active'
               AND (api_key_hash = ?1
                    OR (prev_api_key_hash = ?1
                        AND prev_api_key_expires_at IS NOT NULL
                        AND prev_api_key_expires_at > datetime('now')))`,
        )
        .bind(hash)
        .first()) as ApiKeyApp | null;
    if (!app) return null;
    // Belt-and-suspenders constant-time compare against whichever value matched.
    const matchesCurrent =
        !!app.api_key_hash && timingSafeEqual(hash, app.api_key_hash);
    const matchesPrev =
        !!app.prev_api_key_hash && timingSafeEqual(hash, app.prev_api_key_hash);
    if (!matchesCurrent && !matchesPrev) return null;
    return app;
}
