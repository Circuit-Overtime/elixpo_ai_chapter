/**
 * Template attachments. Each row is a *pointer* (Drive file id, URL, or a
 * {{variable}} expression) — never bytes. At send time we substitute variables,
 * download the file (from the workspace's Drive connection or a plain URL),
 * base64-encode it, and hand it to the SMTP worker as a multipart/mixed part.
 *
 * Size is capped per-file and per-message so a send can't blow the edge memory
 * budget or exceed provider limits (~25 MB for Gmail).
 */

import type { D1Database } from "@cloudflare/workers-types";
import { getAccessToken } from "./drive";
import { newId } from "./ids";
import { substituteVariables } from "./template-vars";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024; // 18 MB per message

export type AttachmentKind = "drive" | "url" | "variable";

export interface AttachmentRow {
    id: string;
    tenant_id: string;
    template_id: string;
    kind: string;
    source: string;
    filename: string | null;
    mime: string | null;
    size: number | null;
    position: number;
    created_at: string;
}

export interface AttachmentPublic {
    id: string;
    kind: string;
    source: string;
    filename: string | null;
    mime: string | null;
    size: number | null;
    position: number;
}

export interface AttachmentInput {
    kind: AttachmentKind;
    source: string;
    filename?: string | null;
    mime?: string | null;
    size?: number | null;
}

/** Validate an untrusted array from a request body into AttachmentInputs. */
export function parseAttachmentInputs(arr: unknown): AttachmentInput[] {
    if (!Array.isArray(arr)) return [];
    const out: AttachmentInput[] = [];
    for (const a of arr) {
        if (!a || typeof a !== "object") continue;
        const o = a as Record<string, unknown>;
        const source = typeof o.source === "string" ? o.source.trim() : "";
        if (!source) continue;
        const kind: AttachmentKind = o.kind === "drive" || o.kind === "variable" ? o.kind : "url";
        out.push({
            kind,
            source,
            filename: typeof o.filename === "string" ? o.filename : null,
            mime: typeof o.mime === "string" ? o.mime : null,
            size: typeof o.size === "number" ? o.size : null,
        });
    }
    return out;
}

export function attachmentToPublic(row: AttachmentRow): AttachmentPublic {
    return {
        id: row.id,
        kind: row.kind,
        source: row.source,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        position: row.position,
    };
}

export async function listAttachments(
    db: D1Database,
    tenantId: string,
    templateId: string,
): Promise<AttachmentRow[]> {
    const res = await db
        .prepare(
            "SELECT * FROM template_attachments WHERE tenant_id = ? AND template_id = ? ORDER BY position ASC, created_at ASC",
        )
        .bind(tenantId, templateId)
        .all();
    return (res.results || []) as unknown as AttachmentRow[];
}

/** Replace a template's attachments wholesale (the composer sends the full set). */
export async function replaceAttachments(
    db: D1Database,
    tenantId: string,
    templateId: string,
    items: AttachmentInput[],
): Promise<void> {
    await db
        .prepare("DELETE FROM template_attachments WHERE tenant_id = ? AND template_id = ?")
        .bind(tenantId, templateId)
        .run();
    let pos = 0;
    for (const it of items) {
        const kind: AttachmentKind =
            it.kind === "drive" || it.kind === "url" || it.kind === "variable" ? it.kind : "url";
        const source = (it.source || "").trim();
        if (!source) continue;
        await db
            .prepare(
                "INSERT INTO template_attachments (id, tenant_id, template_id, kind, source, filename, mime, size, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(
                newId("attachment"),
                tenantId,
                templateId,
                kind,
                source,
                it.filename?.trim() || null,
                it.mime?.trim() || null,
                typeof it.size === "number" ? it.size : null,
                pos++,
            )
            .run();
    }
}

export async function deleteAllForTemplate(
    db: D1Database,
    tenantId: string,
    templateId: string,
): Promise<void> {
    await db
        .prepare("DELETE FROM template_attachments WHERE tenant_id = ? AND template_id = ?")
        .bind(tenantId, templateId)
        .run();
}

// ─── Send-time resolution ────────────────────────────────────────────────────

export interface ResolvedAttachment {
    filename: string;
    contentType: string;
    contentBase64: string;
}

/** Pull a Drive file id out of a share URL, or return the value if it already is one. */
function driveFileId(value: string): string | null {
    const v = value.trim();
    const m =
        v.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        v.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
        v.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v; // looks like a bare file id
    return null;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

async function downloadUrl(
    url: string,
    fallbackName: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string } | null> {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) return null;
    const contentType =
        res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    return { buffer, contentType, filename: fallbackName };
}

async function downloadDrive(
    token: string,
    fileId: string,
    fallbackName: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string } | null> {
    const meta = (await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { name?: string; mimeType?: string; size?: string } | null;
    if (meta?.size && Number(meta.size) > MAX_ATTACHMENT_BYTES) return null;

    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) return null;
    return {
        buffer,
        contentType:
            meta?.mimeType ||
            res.headers.get("content-type")?.split(";")[0] ||
            "application/octet-stream",
        filename: meta?.name || fallbackName,
    };
}

/**
 * Resolve a template's attachments into ready-to-send MIME parts: substitute
 * {{vars}}, download from Drive/URL, base64-encode, and enforce size caps.
 * Skips anything that fails (missing var, oversize, unreachable) rather than
 * failing the whole send. The Drive access token is fetched once, lazily.
 */
export async function resolveAttachments(
    db: D1Database,
    tenantId: string,
    rows: AttachmentRow[],
    vars: Record<string, any>,
): Promise<ResolvedAttachment[]> {
    if (rows.length === 0) return [];
    const out: ResolvedAttachment[] = [];
    let total = 0;
    let driveToken: string | null | undefined; // undefined = not fetched yet

    for (const row of rows) {
        const source = substituteVariables(row.source, vars).trim();
        if (!source) continue;
        const fallbackName =
            (row.filename ? substituteVariables(row.filename, vars).trim() : "") || "attachment";

        // Decide the fetch strategy from the (resolved) source.
        const isUrl = /^https?:\/\//i.test(source);
        const asDriveId = !isUrl
            ? driveFileId(source)
            : isUrl && /drive\.google\.com/i.test(source)
              ? driveFileId(source)
              : null;

        let dl: { buffer: ArrayBuffer; contentType: string; filename: string } | null = null;
        try {
            if (asDriveId) {
                if (driveToken === undefined) driveToken = await getAccessToken(db, tenantId);
                if (driveToken) dl = await downloadDrive(driveToken, asDriveId, fallbackName);
            } else if (isUrl) {
                dl = await downloadUrl(source, fallbackName);
            }
        } catch {
            dl = null;
        }
        if (!dl) continue;

        total += dl.buffer.byteLength;
        if (total > MAX_TOTAL_ATTACHMENT_BYTES) break; // stop adding once over the message cap

        out.push({
            filename: row.filename
                ? substituteVariables(row.filename, vars).trim() || dl.filename
                : dl.filename,
            contentType: row.mime || dl.contentType,
            contentBase64: arrayBufferToBase64(dl.buffer),
        });
    }
    return out;
}
