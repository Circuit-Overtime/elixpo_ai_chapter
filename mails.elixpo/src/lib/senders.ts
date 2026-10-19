/**
 * Senders — a tenant's own mailboxes we relay through (their email + app
 * password). The app password is stored AES-GCM encrypted (app_password_enc)
 * and is NEVER returned to clients; use toPublic() at every API boundary.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { encryptSecret } from "./encryption";
import { newId } from "./ids";

export interface SenderRow {
    id: string;
    tenant_id: string;
    email: string;
    display_name: string | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: string; // 'tls' (implicit, port 465) | 'starttls'
    username: string | null;
    app_password_enc: string;
    status: string;
    is_default: number;
    last_verified_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Safe projection — no secret material, no internal tenant id. */
export interface SenderPublic {
    id: string;
    email: string;
    display_name: string | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: string;
    username: string | null;
    status: string;
    is_default: boolean;
    last_verified_at: string | null;
    created_at: string;
}

export function toPublic(row: SenderRow): SenderPublic {
    return {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        smtp_host: row.smtp_host,
        smtp_port: row.smtp_port,
        smtp_secure: row.smtp_secure,
        username: row.username,
        status: row.status,
        is_default: row.is_default === 1,
        last_verified_at: row.last_verified_at,
        created_at: row.created_at,
    };
}

export interface SenderInput {
    email: string;
    appPassword: string;
    displayName?: string | null;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: string;
    username?: string | null;
}

export async function listSenders(db: D1Database, tenantId: string): Promise<SenderRow[]> {
    const res = await db
        .prepare("SELECT * FROM senders WHERE tenant_id = ? ORDER BY created_at DESC")
        .bind(tenantId)
        .all();
    return (res.results || []) as unknown as SenderRow[];
}

export async function getSender(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<SenderRow | null> {
    return (await db
        .prepare("SELECT * FROM senders WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as SenderRow | null;
}

export async function createSender(
    db: D1Database,
    tenantId: string,
    input: SenderInput,
): Promise<SenderRow> {
    const id = newId("sender");
    const enc = await encryptSecret(input.appPassword);
    const host = input.smtpHost?.trim() || "smtp.gmail.com";
    const port = input.smtpPort ?? 465;
    const secure = input.smtpSecure || (port === 587 ? "starttls" : "tls");
    const username = input.username?.trim() || null;

    await db
        .prepare(
            `INSERT INTO senders
                (id, tenant_id, email, display_name, smtp_host, smtp_port, smtp_secure, username, app_password_enc)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            id,
            tenantId,
            input.email.trim(),
            input.displayName?.trim() || null,
            host,
            port,
            secure,
            username,
            enc,
        )
        .run();

    // The tenant's first sender becomes the default automatically.
    const hasDefault = await db
        .prepare("SELECT 1 FROM senders WHERE tenant_id = ? AND is_default = 1 LIMIT 1")
        .bind(tenantId)
        .first();
    if (!hasDefault) {
        await db
            .prepare("UPDATE senders SET is_default = 1 WHERE id = ? AND tenant_id = ?")
            .bind(id, tenantId)
            .run();
    }

    const row = await getSender(db, tenantId, id);
    if (!row) throw new Error("sender insert failed");
    return row;
}

/** Mark one sender as the tenant default, clearing the previous default. */
export async function setDefaultSender(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<SenderRow | null> {
    const existing = await getSender(db, tenantId, id);
    if (!existing) return null;
    await db
        .prepare("UPDATE senders SET is_default = 0 WHERE tenant_id = ? AND is_default = 1")
        .bind(tenantId)
        .run();
    await db
        .prepare(
            "UPDATE senders SET is_default = 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
        )
        .bind(id, tenantId)
        .run();
    return getSender(db, tenantId, id);
}

export interface SenderUpdate {
    displayName?: string | null;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: string;
    username?: string | null;
    appPassword?: string; // re-encrypted if provided
    status?: string;
}

export async function updateSender(
    db: D1Database,
    tenantId: string,
    id: string,
    update: SenderUpdate,
): Promise<SenderRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (update.displayName !== undefined) {
        sets.push("display_name = ?");
        vals.push(update.displayName?.trim() || null);
    }
    if (update.smtpHost !== undefined) {
        sets.push("smtp_host = ?");
        vals.push(update.smtpHost.trim() || "smtp.gmail.com");
    }
    if (update.smtpPort !== undefined) {
        sets.push("smtp_port = ?");
        vals.push(update.smtpPort);
    }
    if (update.smtpSecure !== undefined) {
        sets.push("smtp_secure = ?");
        vals.push(update.smtpSecure);
    }
    if (update.username !== undefined) {
        sets.push("username = ?");
        vals.push(update.username?.trim() || null);
    }
    if (update.status !== undefined) {
        sets.push("status = ?");
        vals.push(update.status);
    }
    if (update.appPassword) {
        sets.push("app_password_enc = ?");
        vals.push(await encryptSecret(update.appPassword));
    }

    if (sets.length === 0) return getSender(db, tenantId, id);

    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    await db
        .prepare(`UPDATE senders SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
        .bind(...vals)
        .run();

    return getSender(db, tenantId, id);
}

export async function markSenderVerified(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<void> {
    await db
        .prepare(
            "UPDATE senders SET last_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
        )
        .bind(id, tenantId)
        .run();
}

export async function deleteSender(db: D1Database, tenantId: string, id: string): Promise<void> {
    // Detach from any product/template that used this sender, drop its aliases,
    // then delete the sender itself.
    await db
        .prepare(
            "UPDATE products SET default_sender_id = NULL WHERE default_sender_id = ? AND tenant_id = ?",
        )
        .bind(id, tenantId)
        .run();
    await db
        .prepare("UPDATE templates SET sender_id = NULL WHERE sender_id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
    await db
        .prepare("DELETE FROM sender_aliases WHERE sender_id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .run();
    await db.prepare("DELETE FROM senders WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();

    // If we removed the default, promote the most recent remaining sender.
    const stillHasDefault = await db
        .prepare("SELECT 1 FROM senders WHERE tenant_id = ? AND is_default = 1 LIMIT 1")
        .bind(tenantId)
        .first();
    if (!stillHasDefault) {
        await db
            .prepare(
                "UPDATE senders SET is_default = 1 WHERE id = (SELECT id FROM senders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1)",
            )
            .bind(tenantId)
            .run();
    }
}

// ─── Aliases (additional From identities on a sender) ───────────────────────

export interface AliasRow {
    id: string;
    tenant_id: string;
    sender_id: string;
    from_email: string;
    from_name: string | null;
    created_at: string;
}

export interface AliasPublic {
    id: string;
    from_email: string;
    from_name: string | null;
    created_at: string;
}

export function aliasToPublic(row: AliasRow): AliasPublic {
    return {
        id: row.id,
        from_email: row.from_email,
        from_name: row.from_name,
        created_at: row.created_at,
    };
}

export async function listAliases(
    db: D1Database,
    tenantId: string,
    senderId: string,
): Promise<AliasRow[]> {
    const res = await db
        .prepare(
            "SELECT * FROM sender_aliases WHERE sender_id = ? AND tenant_id = ? ORDER BY created_at ASC",
        )
        .bind(senderId, tenantId)
        .all();
    return (res.results || []) as unknown as AliasRow[];
}

export async function getAlias(
    db: D1Database,
    tenantId: string,
    senderId: string,
    aliasId: string,
): Promise<AliasRow | null> {
    return (await db
        .prepare("SELECT * FROM sender_aliases WHERE id = ? AND sender_id = ? AND tenant_id = ?")
        .bind(aliasId, senderId, tenantId)
        .first()) as AliasRow | null;
}

export async function addAlias(
    db: D1Database,
    tenantId: string,
    senderId: string,
    fromEmail: string,
    fromName?: string | null,
): Promise<AliasRow> {
    const id = newId("alias");
    await db
        .prepare(
            "INSERT INTO sender_aliases (id, tenant_id, sender_id, from_email, from_name) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, tenantId, senderId, fromEmail.trim(), fromName?.trim() || null)
        .run();
    const row = await getAlias(db, tenantId, senderId, id);
    if (!row) throw new Error("alias insert failed");
    return row;
}

export async function deleteAlias(
    db: D1Database,
    tenantId: string,
    senderId: string,
    aliasId: string,
): Promise<void> {
    await db
        .prepare("DELETE FROM sender_aliases WHERE id = ? AND sender_id = ? AND tenant_id = ?")
        .bind(aliasId, senderId, tenantId)
        .run();
}
