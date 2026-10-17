/**
 * Suppression list (unsubscribes) per product. The send pipeline checks this
 * before every non-transactional send and skips suppressed recipients.
 *
 * Unsubscribe links are stateless, signed tokens (HMAC with the session secret)
 * encoding product + email — so the public /u/<token> endpoint needs no auth and
 * the link never expires.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { base64url, base64urlDecode, hmacSha256Hex, timingSafeEqual } from "./crypto";
import { getEnv, requireEnv } from "./env";
import { newId } from "./ids";

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// ─── Signed unsubscribe token ────────────────────────────────────────────────

export async function signUnsub(productId: string, email: string): Promise<string> {
    const secret = await requireEnv("ELIXPO_MAIL_SESSION_SECRET");
    const body = base64url(JSON.stringify({ p: productId, e: normalizeEmail(email) }));
    const sig = await hmacSha256Hex(secret, body);
    return `${body}.${sig}`;
}

export async function verifyUnsub(
    token: string | undefined,
): Promise<{ productId: string; email: string } | null> {
    if (!token) return null;
    const secret = await getEnv("ELIXPO_MAIL_SESSION_SECRET");
    if (!secret) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!timingSafeEqual(await hmacSha256Hex(secret, body), sig)) return null;
    try {
        const data = JSON.parse(base64urlDecode(body)) as { p: string; e: string };
        if (!data.p || !data.e) return null;
        return { productId: data.p, email: data.e };
    } catch {
        return null;
    }
}

// ─── Suppression storage ─────────────────────────────────────────────────────

export interface SuppressionRow {
    id: string;
    tenant_id: string;
    product_id: string;
    email: string;
    reason: string | null;
    created_at: string;
}

export interface SuppressionPublic {
    id: string;
    email: string;
    reason: string | null;
    created_at: string;
}

export function suppressionToPublic(row: SuppressionRow): SuppressionPublic {
    return { id: row.id, email: row.email, reason: row.reason, created_at: row.created_at };
}

export async function isSuppressed(
    db: D1Database,
    productId: string,
    email: string,
): Promise<boolean> {
    const hit = await db
        .prepare("SELECT 1 FROM suppressions WHERE product_id = ? AND email = ? LIMIT 1")
        .bind(productId, normalizeEmail(email))
        .first();
    return Boolean(hit);
}

/**
 * Add a suppression. Derives tenant_id from the product so the public
 * unsubscribe endpoint (no session) can call it. Idempotent on (product, email).
 */
export async function suppress(
    db: D1Database,
    productId: string,
    email: string,
    reason: string,
): Promise<boolean> {
    const product = (await db
        .prepare("SELECT tenant_id FROM products WHERE id = ?")
        .bind(productId)
        .first()) as { tenant_id: string } | null;
    if (!product) return false;
    await db
        .prepare(
            "INSERT OR IGNORE INTO suppressions (id, tenant_id, product_id, email, reason) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(newId("suppression"), product.tenant_id, productId, normalizeEmail(email), reason)
        .run();
    return true;
}

export async function unsuppress(db: D1Database, productId: string, email: string): Promise<void> {
    await db
        .prepare("DELETE FROM suppressions WHERE product_id = ? AND email = ?")
        .bind(productId, normalizeEmail(email))
        .run();
}

export async function listSuppressions(
    db: D1Database,
    productId: string,
    limit = 500,
): Promise<SuppressionRow[]> {
    const res = await db
        .prepare("SELECT * FROM suppressions WHERE product_id = ? ORDER BY created_at DESC LIMIT ?")
        .bind(productId, Math.min(Math.max(limit, 1), 1000))
        .all();
    return (res.results || []) as unknown as SuppressionRow[];
}

/** Look up a product's name + tenant for the public unsubscribe page. */
export async function productNameById(
    db: D1Database,
    productId: string,
): Promise<{ name: string; tenant_id: string } | null> {
    return (await db
        .prepare("SELECT name, tenant_id FROM products WHERE id = ?")
        .bind(productId)
        .first()) as { name: string; tenant_id: string } | null;
}
