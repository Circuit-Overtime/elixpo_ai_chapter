/**
 * Webhooks — user-named inbound trigger "events" bound to a template (1:many).
 * Each has a public, unguessable endpoint_key used in the trigger URL
 * (/v1/hooks/<endpoint_key>). The call is authenticated with the parent
 * product's shared secret as a Bearer token (see app/v1/hooks/[key]/route.ts).
 *
 * A webhook inherits product_id from its template, so it's always consistent
 * with the template → product chain.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { base64url } from "./crypto";
import { newId } from "./ids";
import { getProduct } from "./products";
import { getTemplate } from "./templates";

export interface WebhookRow {
    id: string;
    tenant_id: string;
    product_id: string;
    template_id: string;
    name: string;
    endpoint_key: string;
    status: string; // active | disabled
    created_at: string;
    updated_at: string;
}

/** Safe projection for the dashboard (endpoint_key is public, so it's fine to expose). */
export interface WebhookPublic {
    id: string;
    product_id: string;
    template_id: string;
    name: string;
    endpoint_key: string;
    status: string;
    created_at: string;
    updated_at: string;
}

/** Webhook joined with its template + product names for list views. */
export interface WebhookSummary extends WebhookPublic {
    template_name: string;
    template_slug: string;
    product_name: string;
}

export function webhookToPublic(row: WebhookRow): WebhookPublic {
    return {
        id: row.id,
        product_id: row.product_id,
        template_id: row.template_id,
        name: row.name,
        endpoint_key: row.endpoint_key,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

/** Public token embedded in the trigger URL — unguessable, URL-safe. */
function newEndpointKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    return `whe_${base64url(bytes.buffer)}`;
}

async function uniqueEndpointKey(db: D1Database): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const key = newEndpointKey();
        const hit = await db
            .prepare("SELECT 1 FROM webhooks WHERE endpoint_key = ? LIMIT 1")
            .bind(key)
            .first();
        if (!hit) return key;
    }
    return newEndpointKey();
}

export async function listWebhooks(db: D1Database, tenantId: string): Promise<WebhookSummary[]> {
    const res = await db
        .prepare(
            `SELECT w.*, t.name AS template_name, t.slug AS template_slug, p.name AS product_name
             FROM webhooks w
             JOIN templates t ON t.id = w.template_id
             JOIN products p ON p.id = w.product_id
             WHERE w.tenant_id = ?
             ORDER BY w.created_at ASC`,
        )
        .bind(tenantId)
        .all();
    return ((res.results || []) as any[]).map((r) => ({
        ...webhookToPublic(r as WebhookRow),
        template_name: r.template_name,
        template_slug: r.template_slug,
        product_name: r.product_name,
    }));
}

/** Webhooks for one product, joined with template/product names. */
export async function listWebhooksByProduct(
    db: D1Database,
    tenantId: string,
    productId: string,
): Promise<WebhookSummary[]> {
    const res = await db
        .prepare(
            `SELECT w.*, t.name AS template_name, t.slug AS template_slug, p.name AS product_name
             FROM webhooks w
             JOIN templates t ON t.id = w.template_id
             JOIN products p ON p.id = w.product_id
             WHERE w.tenant_id = ? AND w.product_id = ?
             ORDER BY w.created_at ASC`,
        )
        .bind(tenantId, productId)
        .all();
    return ((res.results || []) as any[]).map((r) => ({
        ...webhookToPublic(r as WebhookRow),
        template_name: r.template_name,
        template_slug: r.template_slug,
        product_name: r.product_name,
    }));
}

export async function listWebhooksByTemplate(
    db: D1Database,
    tenantId: string,
    templateId: string,
): Promise<WebhookRow[]> {
    const res = await db
        .prepare(
            "SELECT * FROM webhooks WHERE tenant_id = ? AND template_id = ? ORDER BY created_at DESC",
        )
        .bind(tenantId, templateId)
        .all();
    return (res.results || []) as unknown as WebhookRow[];
}

export async function getWebhook(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<WebhookRow | null> {
    return (await db
        .prepare("SELECT * FROM webhooks WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as WebhookRow | null;
}

/** Public lookup by endpoint_key (no tenant scope — used by the trigger endpoint). */
export async function getWebhookByEndpointKey(
    db: D1Database,
    endpointKey: string,
): Promise<WebhookRow | null> {
    return (await db
        .prepare("SELECT * FROM webhooks WHERE endpoint_key = ?")
        .bind(endpointKey)
        .first()) as WebhookRow | null;
}

/**
 * Create a webhook that attaches a template to a product. The product is the one
 * the webhook is created UNDER (so a template can be wired to many products via
 * many webhooks) — NOT the template's home product. Falls back to the template's
 * home product only when no productId is supplied.
 */
export async function createWebhook(
    db: D1Database,
    tenantId: string,
    templateId: string,
    name: string,
    productId?: string | null,
): Promise<WebhookRow | null> {
    const template = await getTemplate(db, tenantId, templateId);
    if (!template) return null;

    let pid = template.product_id;
    if (productId) {
        const product = await getProduct(db, tenantId, productId);
        if (!product) return null; // chosen product doesn't exist / not owned
        pid = product.id;
    }

    const id = newId("webhook");
    const endpointKey = await uniqueEndpointKey(db);
    await db
        .prepare(
            "INSERT INTO webhooks (id, tenant_id, product_id, template_id, name, endpoint_key) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, tenantId, pid, templateId, name.trim() || "Untitled event", endpointKey)
        .run();
    return getWebhook(db, tenantId, id);
}

/** Count of webhooks per template for the tenant (template_id → count). */
export async function webhookCountsByTemplate(
    db: D1Database,
    tenantId: string,
): Promise<Record<string, number>> {
    const res = await db
        .prepare(
            "SELECT template_id, COUNT(*) AS n FROM webhooks WHERE tenant_id = ? GROUP BY template_id",
        )
        .bind(tenantId)
        .all();
    const out: Record<string, number> = {};
    for (const r of (res.results || []) as any[]) out[r.template_id] = Number(r.n) || 0;
    return out;
}

export interface WebhookUpdate {
    name?: string;
    status?: string;
}

export async function updateWebhook(
    db: D1Database,
    tenantId: string,
    id: string,
    update: WebhookUpdate,
): Promise<WebhookRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (update.name !== undefined) {
        sets.push("name = ?");
        vals.push(update.name.trim() || "Untitled event");
    }
    if (update.status === "active" || update.status === "disabled") {
        sets.push("status = ?");
        vals.push(update.status);
    }
    if (sets.length === 0) return getWebhook(db, tenantId, id);
    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    await db
        .prepare(`UPDATE webhooks SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
        .bind(...vals)
        .run();
    return getWebhook(db, tenantId, id);
}

export async function deleteWebhook(db: D1Database, tenantId: string, id: string): Promise<void> {
    await db
        .prepare("DELETE FROM webhooks WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
}
