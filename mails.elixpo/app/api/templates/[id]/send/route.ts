export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getProduct } from "@/lib/products";
import { deliverTemplate } from "@/lib/send-pipeline";
import { getAlias, getSender } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { getTemplate } from "@/lib/templates";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 50;

function parseRecipients(raw: unknown): string[] {
    const list: string[] = [];
    if (Array.isArray(raw)) {
        for (const v of raw) if (typeof v === "string") list.push(v);
    } else if (typeof raw === "string") {
        list.push(...raw.split(/[\s,;]+/));
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of list) {
        const e = r.trim().toLowerCase();
        if (e && EMAIL_RE.test(e) && !seen.has(e)) {
            seen.add(e);
            out.push(e);
        }
    }
    return out;
}

/**
 * POST /api/templates/:id/send — one-time send of a saved template to one or
 * more recipients, NOW, without a webhook. Runs the full delivery pipeline
 * (suppression, unsubscribe footer, attachments, delivery logging) per
 * recipient. Body: { to: string|string[], vars?, senderId?, aliasId? }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    let body: any = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const recipients = parseRecipients(body?.to);
    if (recipients.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Enter at least one valid recipient." },
            { status: 400 },
        );
    }
    if (recipients.length > MAX_RECIPIENTS) {
        return NextResponse.json(
            { ok: false, error: `Too many recipients (max ${MAX_RECIPIENTS} per one-time send).` },
            { status: 400 },
        );
    }

    try {
        const db = await getDatabase();
        const template = await getTemplate(db, session.tenantId, id);
        if (!template) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

        // Apply live editor overrides (so the send matches the preview) and an
        // optional sender override on a shallow template clone.
        let effectiveTemplate = template;
        if (typeof body?.subject === "string")
            effectiveTemplate = { ...effectiveTemplate, subject: body.subject };
        if (typeof body?.contentHtml === "string")
            effectiveTemplate = { ...effectiveTemplate, content_html: body.contentHtml };
        if (typeof body?.bgColor === "string")
            effectiveTemplate = { ...effectiveTemplate, bg_color: body.bgColor };
        if (typeof body?.senderId === "string" && body.senderId) {
            const sender = await getSender(db, session.tenantId, body.senderId);
            if (!sender)
                return NextResponse.json({ ok: false, error: "Unknown sender." }, { status: 400 });
            effectiveTemplate = { ...effectiveTemplate, sender_id: sender.id };
        }

        // Optional alias as the From identity.
        let fromEmail: string | null = null;
        let fromName: string | null = null;
        if (typeof body?.aliasId === "string" && body.aliasId) {
            const senderId = effectiveTemplate.sender_id;
            const alias = senderId
                ? await getAlias(db, session.tenantId, senderId, body.aliasId)
                : null;
            if (!alias)
                return NextResponse.json({ ok: false, error: "Unknown alias." }, { status: 400 });
            fromEmail = alias.from_email;
            fromName = alias.from_name;
        }

        const globalVars = body?.vars && typeof body.vars === "object" ? body.vars : {};
        const recipientVars =
            body?.recipientVars && typeof body.recipientVars === "object" ? body.recipientVars : {};
        const product = template.product_id
            ? await getProduct(db, session.tenantId, template.product_id)
            : null;

        const results = [];
        for (const to of recipients) {
            const vars = { ...globalVars, ...(recipientVars[to] || {}) };
            const r = await deliverTemplate(db, {
                tenantId: session.tenantId,
                template: effectiveTemplate,
                product,
                webhookId: null,
                to,
                vars,
                fromEmail,
                fromName,
            });
            results.push({ to, ok: r.ok, status: r.status, error: r.error ?? null });
        }

        const sent = results.filter((r) => r.status === "sent").length;
        const suppressed = results.filter((r) => r.status === "suppressed").length;
        const failed = results.filter((r) => r.status === "failed").length;
        // Transient failures handed to the retry queue — accepted, not failed.
        const queued = results.filter((r) => r.status === "queued").length;

        return NextResponse.json({
            ok: failed === 0,
            summary: { total: results.length, sent, suppressed, failed, queued },
            results,
        });
    } catch (e: any) {
        console.error("[templates/send] error:", e);
        return NextResponse.json(
            { ok: false, error: `Send error: ${String(e?.message || e)}` },
            { status: 500 },
        );
    }
}
