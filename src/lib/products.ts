/**
 * Products — group templates and (from step 4) hold client_id + shared secret.
 * For now templates need a parent product, so we auto-provision a "Default"
 * product per tenant; full product CRUD (naming, credentials, rotation) lands
 * in step 4.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { base64url, sha256Hex } from "./crypto";
import { decryptSecret, encryptSecret } from "./encryption";
import { isoDaysFromNow, newId, nowIso } from "./ids";
import type { EmailFooter } from "./render";

export interface ProductRow {
    id: string;
    tenant_id: string;
    name: string;
    client_id: string;
    secret_hash: string | null;
    prev_secret_hash: string | null;
    prev_secret_expires_at: string | null;
    secret_enc: string | null; // AES-GCM encrypted secret — recoverable for HMAC signing
    prev_secret_enc: string | null; // previous secret during rotation grace
    default_sender_id: string | null;
    description: string | null;
    homepage_url: string | null;
    support_email: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    footer_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

export function slugify(s: string): string {
    // Collapse runs of non-alphanumerics to a single dash, then trim leading/
    // trailing dashes with a linear scan (avoids the /^-+|-+$/ polynomial
    // backtracking CodeQL flags on long dash runs).
    const collapsed = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed.charCodeAt(start) === 45 /* '-' */) start++;
    while (end > start && collapsed.charCodeAt(end - 1) === 45) end--;
    return collapsed.slice(start, end).slice(0, 40) || "product";
}

export async function listProducts(db: D1Database, tenantId: string): Promise<ProductRow[]> {
    const res = await db
        .prepare("SELECT * FROM products WHERE tenant_id = ? ORDER BY created_at ASC")
        .bind(tenantId)
        .all();
    return (res.results || []) as unknown as ProductRow[];
}

export async function getProduct(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<ProductRow | null> {
    return (await db
        .prepare("SELECT * FROM products WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as ProductRow | null;
}

/** Return the tenant's first product, creating a "Default" one if none exist. */
export async function getOrCreateDefaultProduct(
    db: D1Database,
    tenantId: string,
): Promise<ProductRow> {
    const existing = (await db
        .prepare("SELECT * FROM products WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1")
        .bind(tenantId)
        .first()) as ProductRow | null;
    if (existing) return existing;

    const { product } = await createProduct(db, tenantId, "Default");
    return product;
}

// ─── Public projection (no secret hashes) ───────────────────────────────────

export interface ProductPublic {
    id: string;
    name: string;
    client_id: string;
    has_secret: boolean;
    default_sender_id: string | null;
    description: string | null;
    homepage_url: string | null;
    support_email: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    footer_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface ProductSummary extends ProductPublic {
    template_count: number;
    webhook_count: number;
}

export function productToPublic(row: ProductRow): ProductPublic {
    return {
        id: row.id,
        name: row.name,
        client_id: row.client_id,
        has_secret: Boolean(row.secret_hash),
        default_sender_id: row.default_sender_id,
        description: row.description,
        homepage_url: row.homepage_url,
        support_email: row.support_email,
        logo_url: row.logo_url,
        address: row.address,
        phone: row.phone,
        footer_note: row.footer_note,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// ─── Credentials ────────────────────────────────────────────────────────────

/** Generate a fresh shared secret (shown to the user once). */
function newSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return `lix_mail_${base64url(bytes.buffer)}`;
}

async function uniqueClientId(db: D1Database, name: string): Promise<string> {
    const base = slugify(name);
    for (let i = 0; i < 5; i++) {
        const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
        const candidate = `${base}-${rand}`;
        const hit = await db
            .prepare("SELECT 1 FROM products WHERE client_id = ? LIMIT 1")
            .bind(candidate)
            .first();
        if (!hit) return candidate;
    }
    return `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Commercial details shown on a product's detail page. */
export interface ProductCommercial {
    description?: string | null;
    homepageUrl?: string | null;
    supportEmail?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    footerNote?: string | null;
}

/** Build the email footer (brand block) from a product. */
export function productToFooter(p: ProductRow | ProductPublic): EmailFooter {
    return {
        name: p.name,
        logoUrl: p.logo_url,
        homepageUrl: p.homepage_url,
        supportEmail: p.support_email,
        address: p.address,
        phone: p.phone,
        quote: p.footer_note,
    };
}

/** Create a product with a client_id + shared secret (returned once). */
export async function createProduct(
    db: D1Database,
    tenantId: string,
    name: string,
    defaultSenderId?: string | null,
    commercial?: ProductCommercial,
): Promise<{ product: ProductRow; secret: string }> {
    const id = newId("product");
    const clientId = await uniqueClientId(db, name);
    const secret = newSecret();
    const hash = await sha256Hex(secret);
    const enc = await encryptSecret(secret);

    await db
        .prepare(
            `INSERT INTO products
                (id, tenant_id, name, client_id, secret_hash, secret_enc, default_sender_id, description, homepage_url, support_email, logo_url, address, phone, footer_note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            id,
            tenantId,
            name.trim() || "Untitled product",
            clientId,
            hash,
            enc,
            defaultSenderId || null,
            commercial?.description?.trim() || null,
            commercial?.homepageUrl?.trim() || null,
            commercial?.supportEmail?.trim() || null,
            commercial?.logoUrl?.trim() || null,
            commercial?.address?.trim() || null,
            commercial?.phone?.trim() || null,
            commercial?.footerNote?.trim() || null,
        )
        .run();

    const product = await getProduct(db, tenantId, id);
    if (!product) throw new Error("product insert failed");
    return { product, secret };
}

/** Rotate the shared secret. Keeps the old hash valid during a grace window. */
export async function rotateSecret(
    db: D1Database,
    tenantId: string,
    id: string,
    graceDays = 2,
): Promise<{ product: ProductRow; secret: string } | null> {
    const existing = await getProduct(db, tenantId, id);
    if (!existing) return null;
    const secret = newSecret();
    const hash = await sha256Hex(secret);
    const enc = await encryptSecret(secret);
    await db
        .prepare(
            `UPDATE products SET
                prev_secret_hash = secret_hash,
                prev_secret_enc = secret_enc,
                prev_secret_expires_at = ?,
                secret_hash = ?,
                secret_enc = ?,
                updated_at = datetime('now')
             WHERE id = ? AND tenant_id = ?`,
        )
        .bind(isoDaysFromNow(graceDays), hash, enc, id, tenantId)
        .run();
    const product = await getProduct(db, tenantId, id);
    return product ? { product, secret } : null;
}

/**
 * Recover the signing secrets needed to verify an inbound HMAC signature:
 * the current secret, plus the previous one if its rotation grace window is
 * still open. Returns null secrets where unavailable (e.g. a product created
 * before secret_enc existed — it must rotate its secret to enable signing).
 */
export async function getSigningSecrets(
    product: ProductRow,
): Promise<{ secret: string | null; prevSecret: string | null; prevValid: boolean }> {
    let secret: string | null = null;
    if (product.secret_enc) {
        try {
            secret = await decryptSecret(product.secret_enc);
        } catch {
            secret = null;
        }
    }
    let prevSecret: string | null = null;
    const prevValid = Boolean(
        product.prev_secret_enc &&
            product.prev_secret_expires_at &&
            product.prev_secret_expires_at > nowIso(),
    );
    if (prevValid && product.prev_secret_enc) {
        try {
            prevSecret = await decryptSecret(product.prev_secret_enc);
        } catch {
            prevSecret = null;
        }
    }
    return { secret, prevSecret, prevValid: prevValid && Boolean(prevSecret) };
}

export interface ProductUpdate {
    name?: string;
    defaultSenderId?: string | null;
    status?: string;
    description?: string | null;
    homepageUrl?: string | null;
    supportEmail?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    footerNote?: string | null;
}

export async function updateProduct(
    db: D1Database,
    tenantId: string,
    id: string,
    update: ProductUpdate,
): Promise<ProductRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (update.name !== undefined) {
        sets.push("name = ?");
        vals.push(update.name.trim() || "Untitled product");
    }
    if (update.defaultSenderId !== undefined) {
        sets.push("default_sender_id = ?");
        vals.push(update.defaultSenderId || null);
    }
    if (update.status !== undefined) {
        sets.push("status = ?");
        vals.push(update.status);
    }
    if (update.description !== undefined) {
        sets.push("description = ?");
        vals.push(update.description?.trim() || null);
    }
    if (update.homepageUrl !== undefined) {
        sets.push("homepage_url = ?");
        vals.push(update.homepageUrl?.trim() || null);
    }
    if (update.supportEmail !== undefined) {
        sets.push("support_email = ?");
        vals.push(update.supportEmail?.trim() || null);
    }
    if (update.logoUrl !== undefined) {
        sets.push("logo_url = ?");
        vals.push(update.logoUrl?.trim() || null);
    }
    if (update.address !== undefined) {
        sets.push("address = ?");
        vals.push(update.address?.trim() || null);
    }
    if (update.phone !== undefined) {
        sets.push("phone = ?");
        vals.push(update.phone?.trim() || null);
    }
    if (update.footerNote !== undefined) {
        sets.push("footer_note = ?");
        vals.push(update.footerNote?.trim() || null);
    }
    if (sets.length === 0) return getProduct(db, tenantId, id);
    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    await db
        .prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
        .bind(...vals)
        .run();
    return getProduct(db, tenantId, id);
}

export async function countProductTemplates(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<number> {
    const row = (await db
        .prepare("SELECT COUNT(*) AS n FROM templates WHERE product_id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as { n: number } | null;
    return row?.n ?? 0;
}

/** Delete a product (caller must ensure it has no templates). Drops its webhooks. */
export async function deleteProduct(db: D1Database, tenantId: string, id: string): Promise<void> {
    await db
        .prepare("DELETE FROM webhooks WHERE product_id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
    await db
        .prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
}

/** List products with template + webhook counts for the dashboard. */
export async function listProductsWithCounts(
    db: D1Database,
    tenantId: string,
): Promise<ProductSummary[]> {
    const res = await db
        .prepare(
            `SELECT p.*,
                (SELECT COUNT(*) FROM templates t WHERE t.product_id = p.id) AS template_count,
                (SELECT COUNT(*) FROM webhooks w WHERE w.product_id = p.id) AS webhook_count
             FROM products p WHERE p.tenant_id = ? ORDER BY p.created_at ASC`,
        )
        .bind(tenantId)
        .all();
    return ((res.results || []) as any[]).map((r) => ({
        ...productToPublic(r as ProductRow),
        template_count: Number(r.template_count) || 0,
        webhook_count: Number(r.webhook_count) || 0,
    }));
}
