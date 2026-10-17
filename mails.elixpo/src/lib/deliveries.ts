/**
 * Delivery logs — one row per triggered send (success OR failure). Written by
 * the public trigger endpoint and the template test-send. Scoped per product
 * for the dashboard logs view.
 *
 * Lifecycle: a row is created `sending`, then transitioned to `sent` (with the
 * final SMTP response) or `failed` (with the error). We never store rendered
 * body HTML — only the metadata needed to audit and debug a send.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { newId } from "./ids";

export type DeliveryStatus = "queued" | "sending" | "sent" | "failed" | "suppressed";

export interface DeliveryRow {
    id: string;
    tenant_id: string;
    product_id: string | null;
    template_id: string | null;
    webhook_id: string | null;
    sender_id: string | null;
    to_email: string;
    subject: string | null;
    status: string;
    attempts: number;
    error: string | null;
    smtp_response: string | null;
    vars_json: string | null;
    idempotency_key: string | null;
    queued_at: string;
    sent_at: string | null;
    created_at: string;
}

export interface DeliveryPublic {
    id: string;
    product_id: string | null;
    template_id: string | null;
    webhook_id: string | null;
    sender_id: string | null;
    to_email: string;
    subject: string | null;
    status: string;
    attempts: number;
    error: string | null;
    smtp_response: string | null;
    vars: Record<string, any> | null;
    idempotency_key: string | null;
    queued_at: string;
    sent_at: string | null;
}

/** Delivery joined with template/product/webhook names for the logs table. */
export interface DeliverySummary extends DeliveryPublic {
    template_name: string | null;
    product_name: string | null;
    webhook_name: string | null;
    sender_email: string | null;
}

function parseVars(s: string | null): Record<string, any> | null {
    if (!s) return null;
    try {
        return JSON.parse(s) as Record<string, any>;
    } catch {
        return null;
    }
}

export function deliveryToPublic(row: DeliveryRow): DeliveryPublic {
    return {
        id: row.id,
        product_id: row.product_id,
        template_id: row.template_id,
        webhook_id: row.webhook_id,
        sender_id: row.sender_id,
        to_email: row.to_email,
        subject: row.subject,
        status: row.status,
        attempts: row.attempts,
        error: row.error,
        smtp_response: row.smtp_response,
        vars: parseVars(row.vars_json),
        idempotency_key: row.idempotency_key,
        queued_at: row.queued_at,
        sent_at: row.sent_at,
    };
}

export interface NewDelivery {
    tenantId: string;
    productId?: string | null;
    templateId?: string | null;
    webhookId?: string | null;
    senderId?: string | null;
    toEmail: string;
    subject?: string | null;
    vars?: Record<string, any> | null;
    idempotencyKey?: string | null;
    status?: DeliveryStatus;
}

/** Insert a delivery row (defaults to `sending`) and return its id. */
export async function createDelivery(db: D1Database, d: NewDelivery): Promise<string> {
    const id = newId("delivery");
    await db
        .prepare(
            `INSERT INTO deliveries
                (id, tenant_id, product_id, template_id, webhook_id, sender_id, to_email, subject, status, attempts, vars_json, idempotency_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
            id,
            d.tenantId,
            d.productId || null,
            d.templateId || null,
            d.webhookId || null,
            d.senderId || null,
            d.toEmail,
            d.subject || null,
            d.status || "sending",
            d.vars ? JSON.stringify(d.vars) : null,
            d.idempotencyKey || null,
        )
        .run();
    return id;
}

export async function markDeliverySent(
    db: D1Database,
    id: string,
    smtpResponse?: string | null,
): Promise<void> {
    await db
        .prepare(
            "UPDATE deliveries SET status = 'sent', smtp_response = ?, error = NULL, sent_at = datetime('now') WHERE id = ?",
        )
        .bind(smtpResponse || null, id)
        .run();
}

export async function markDeliveryFailed(
    db: D1Database,
    id: string,
    error: string,
    smtpResponse?: string | null,
): Promise<void> {
    await db
        .prepare(
            "UPDATE deliveries SET status = 'failed', error = ?, smtp_response = ? WHERE id = ?",
        )
        .bind(error.slice(0, 1000), smtpResponse || null, id)
        .run();
}

/**
 * Park a delivery as awaiting an asynchronous retry. The last transient error
 * is kept on the row so the logs explain *why* it's still in flight, but the
 * status stays `queued` until a retry resolves it to sent/failed.
 */
export async function markDeliveryQueued(
    db: D1Database,
    id: string,
    lastError?: string | null,
): Promise<void> {
    await db
        .prepare("UPDATE deliveries SET status = 'queued', error = ? WHERE id = ?")
        .bind(lastError ? lastError.slice(0, 1000) : null, id)
        .run();
}

/** Count this attempt against the row (used by the retry consumer). */
export async function incrementAttempts(db: D1Database, id: string): Promise<number> {
    const row = (await db
        .prepare("UPDATE deliveries SET attempts = attempts + 1 WHERE id = ? RETURNING attempts")
        .bind(id)
        .first()) as { attempts?: number } | null;
    return row?.attempts ?? 0;
}

/** Load a single delivery row by id (used by the retry consumer). */
export async function getDelivery(db: D1Database, id: string): Promise<DeliveryRow | null> {
    return (await db
        .prepare("SELECT * FROM deliveries WHERE id = ? LIMIT 1")
        .bind(id)
        .first()) as DeliveryRow | null;
}

/** Find a prior delivery by idempotency key (per tenant) to dedupe retries. */
export async function findByIdempotencyKey(
    db: D1Database,
    tenantId: string,
    key: string,
): Promise<DeliveryRow | null> {
    return (await db
        .prepare(
            "SELECT * FROM deliveries WHERE tenant_id = ? AND idempotency_key = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(tenantId, key)
        .first()) as DeliveryRow | null;
}

export interface ListDeliveriesOptions {
    productId?: string | null;
    status?: string | null;
    templateId?: string | null;
    limit?: number;
    before?: string | null; // queued_at cursor for pagination
}

/** List deliveries for the dashboard logs view (newest first), with joins. */
export async function listDeliveries(
    db: D1Database,
    tenantId: string,
    opts: ListDeliveriesOptions = {},
): Promise<DeliverySummary[]> {
    const where: string[] = ["d.tenant_id = ?"];
    const vals: unknown[] = [tenantId];
    if (opts.productId) {
        where.push("d.product_id = ?");
        vals.push(opts.productId);
    }
    if (opts.templateId) {
        where.push("d.template_id = ?");
        vals.push(opts.templateId);
    }
    if (opts.status) {
        where.push("d.status = ?");
        vals.push(opts.status);
    }
    if (opts.before) {
        where.push("d.queued_at < ?");
        vals.push(opts.before);
    }
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);

    const res = await db
        .prepare(
            `SELECT d.*,
                t.name AS template_name,
                p.name AS product_name,
                w.name AS webhook_name,
                s.email AS sender_email
             FROM deliveries d
             LEFT JOIN templates t ON t.id = d.template_id
             LEFT JOIN products p ON p.id = d.product_id
             LEFT JOIN webhooks w ON w.id = d.webhook_id
             LEFT JOIN senders s ON s.id = d.sender_id
             WHERE ${where.join(" AND ")}
             ORDER BY d.queued_at DESC
             LIMIT ${limit}`,
        )
        .bind(...vals)
        .all();
    return ((res.results || []) as any[]).map((r) => ({
        ...deliveryToPublic(r as DeliveryRow),
        template_name: r.template_name ?? null,
        product_name: r.product_name ?? null,
        webhook_name: r.webhook_name ?? null,
        sender_email: r.sender_email ?? null,
    }));
}

/** Aggregate counts by status for the logs header (optionally per product). */
export async function deliveryStats(
    db: D1Database,
    tenantId: string,
    productId?: string | null,
): Promise<{ total: number; sent: number; failed: number }> {
    const vals: unknown[] = [tenantId];
    let clause = "tenant_id = ?";
    if (productId) {
        clause += " AND product_id = ?";
        vals.push(productId);
    }
    const res = await db
        .prepare(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
             FROM deliveries WHERE ${clause}`,
        )
        .bind(...vals)
        .first();
    const r = (res || {}) as any;
    return {
        total: Number(r.total) || 0,
        sent: Number(r.sent) || 0,
        failed: Number(r.failed) || 0,
    };
}
