/**
 * Templates — lixeditor documents with {{variable}} placeholders. content_json
 * (the BlockNote doc) is the source of truth; content_html is a cached render
 * used by previews and (later) the email send path. variables_json is the
 * derived list of declared {{vars}}.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { newId } from "./ids";
import type { EmailFooter } from "./render";
import { extractVariables } from "./template-vars";

export interface TemplateRow {
    id: string;
    tenant_id: string;
    product_id: string | null;
    slug: string;
    name: string;
    kind: string;
    subject: string;
    content_json: string | null;
    content_html: string | null;
    variables_json: string | null;
    sender_id: string | null;
    bg_color: string | null;
    transactional: number;
    footer_json: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

/** Summary for list views — no heavy content. */
export interface TemplateSummary {
    id: string;
    product_id: string | null;
    /** Derived: true when no product is attached (compose-and-send). */
    oneTime: boolean;
    slug: string;
    name: string;
    kind: string;
    subject: string;
    variables: string[];
    sender_id: string | null;
    transactional: boolean;
    status: string;
    updated_at: string;
}

/** Full template including the editor document, for editing/preview. */
export interface TemplatePublic extends TemplateSummary {
    content: any[] | null;
    content_html: string | null;
    bg_color: string | null;
    /** Per-template footer (one-time templates); null = none / inherit product. */
    footer: EmailFooter | null;
    created_at: string;
}

function parseJson<T>(s: string | null, fallback: T): T {
    if (!s) return fallback;
    try {
        return JSON.parse(s) as T;
    } catch {
        return fallback;
    }
}

export function toSummary(row: TemplateRow): TemplateSummary {
    return {
        id: row.id,
        product_id: row.product_id,
        oneTime: row.product_id == null,
        slug: row.slug,
        name: row.name,
        kind: row.kind,
        subject: row.subject,
        variables: parseJson<string[]>(row.variables_json, []),
        sender_id: row.sender_id,
        transactional: row.transactional === 1,
        status: row.status,
        updated_at: row.updated_at,
    };
}

export function toPublic(row: TemplateRow): TemplatePublic {
    return {
        ...toSummary(row),
        content: parseJson<any[] | null>(row.content_json, null),
        content_html: row.content_html,
        bg_color: row.bg_color,
        footer: parseJson<EmailFooter | null>(row.footer_json, null),
        created_at: row.created_at,
    };
}

export async function listTemplates(db: D1Database, tenantId: string): Promise<TemplateRow[]> {
    const res = await db
        .prepare("SELECT * FROM templates WHERE tenant_id = ? ORDER BY updated_at DESC")
        .bind(tenantId)
        .all();
    return (res.results || []) as unknown as TemplateRow[];
}

export async function getTemplate(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<TemplateRow | null> {
    return (await db
        .prepare("SELECT * FROM templates WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as TemplateRow | null;
}

export interface TemplateInput {
    name: string;
    slug: string;
    subject?: string;
    kind?: string;
    contentJson?: any[] | null;
    contentHtml?: string | null;
    senderId?: string | null;
    bgColor?: string | null;
    transactional?: boolean;
    footer?: EmailFooter | null;
}

export async function createTemplate(
    db: D1Database,
    tenantId: string,
    /** null = a one-time template (no product attached). */
    productId: string | null,
    input: TemplateInput,
): Promise<TemplateRow> {
    const id = newId("template");
    const subject = input.subject || "";
    const contentHtml = input.contentHtml || "";
    const variables = extractVariables(subject, contentHtml);

    await db
        .prepare(
            `INSERT INTO templates
                (id, tenant_id, product_id, slug, name, kind, subject, content_json, content_html, variables_json, sender_id, bg_color, transactional, footer_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            id,
            tenantId,
            productId,
            input.slug,
            input.name,
            input.kind || "custom",
            subject,
            input.contentJson ? JSON.stringify(input.contentJson) : null,
            contentHtml || null,
            JSON.stringify(variables),
            input.senderId || null,
            input.bgColor || null,
            input.transactional ? 1 : 0,
            input.footer ? JSON.stringify(input.footer) : null,
        )
        .run();

    const row = await getTemplate(db, tenantId, id);
    if (!row) throw new Error("template insert failed");
    return row;
}

export interface TemplateUpdate {
    name?: string;
    slug?: string;
    subject?: string;
    kind?: string;
    contentJson?: any[] | null;
    contentHtml?: string | null;
    senderId?: string | null;
    bgColor?: string | null;
    transactional?: boolean;
    status?: string;
    /** null detaches the product (makes it a one-time template). */
    productId?: string | null;
    /** null clears the per-template footer. */
    footer?: EmailFooter | null;
}

export async function updateTemplate(
    db: D1Database,
    tenantId: string,
    id: string,
    update: TemplateUpdate,
): Promise<TemplateRow | null> {
    const existing = await getTemplate(db, tenantId, id);
    if (!existing) return null;

    const sets: string[] = [];
    const vals: unknown[] = [];

    if (update.name !== undefined) {
        sets.push("name = ?");
        vals.push(update.name);
    }
    if (update.slug !== undefined) {
        sets.push("slug = ?");
        vals.push(update.slug);
    }
    if (update.kind !== undefined) {
        sets.push("kind = ?");
        vals.push(update.kind);
    }
    if (update.senderId !== undefined) {
        sets.push("sender_id = ?");
        vals.push(update.senderId);
    }
    if (update.bgColor !== undefined) {
        sets.push("bg_color = ?");
        vals.push(update.bgColor);
    }
    if (update.transactional !== undefined) {
        sets.push("transactional = ?");
        vals.push(update.transactional ? 1 : 0);
    }
    if (update.status !== undefined) {
        sets.push("status = ?");
        vals.push(update.status);
    }
    if (update.productId !== undefined) {
        sets.push("product_id = ?");
        vals.push(update.productId);
    }
    if (update.footer !== undefined) {
        sets.push("footer_json = ?");
        vals.push(update.footer ? JSON.stringify(update.footer) : null);
    }
    if (update.contentJson !== undefined) {
        sets.push("content_json = ?");
        vals.push(update.contentJson ? JSON.stringify(update.contentJson) : null);
    }

    // Subject / HTML drive the derived variable list — recompute when either changes.
    const subjectChanged = update.subject !== undefined;
    const htmlChanged = update.contentHtml !== undefined;
    if (subjectChanged) {
        sets.push("subject = ?");
        vals.push(update.subject);
    }
    if (htmlChanged) {
        sets.push("content_html = ?");
        vals.push(update.contentHtml || null);
    }
    if (subjectChanged || htmlChanged) {
        const subject = subjectChanged ? update.subject || "" : existing.subject;
        const html = htmlChanged ? update.contentHtml || "" : existing.content_html || "";
        sets.push("variables_json = ?");
        vals.push(JSON.stringify(extractVariables(subject, html)));
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    await db
        .prepare(`UPDATE templates SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
        .bind(...vals)
        .run();

    return getTemplate(db, tenantId, id);
}

export async function deleteTemplate(db: D1Database, tenantId: string, id: string): Promise<void> {
    await db
        .prepare("DELETE FROM templates WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
}
