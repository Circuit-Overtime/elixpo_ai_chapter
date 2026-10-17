export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { decryptSecret } from "@/lib/encryption";
import { getProduct, productToFooter } from "@/lib/products";
import { renderTemplate } from "@/lib/render";
import { getAlias, getSender } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { relayViaSender } from "@/lib/smtp-sender";
import { getTemplate } from "@/lib/templates";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/templates/:id/test — render the template with sample vars and send
 * it through a chosen sender (the full template → inbox chain, on demand).
 * Body: { senderId, to, vars?, aliasId?, subject?, contentHtml? }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    let body: any = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    try {
        const db = await getDatabase();
        const tmpl = await getTemplate(db, session.tenantId, id);
        if (!tmpl) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

        const senderId = typeof body?.senderId === "string" ? body.senderId : "";
        const sender = senderId ? await getSender(db, session.tenantId, senderId) : null;
        if (!sender) {
            return NextResponse.json(
                { ok: false, error: "Choose a sender to send through." },
                { status: 400 },
            );
        }

        const to = typeof body?.to === "string" ? body.to.trim() : "";
        if (!EMAIL_RE.test(to)) {
            return NextResponse.json(
                { ok: false, error: "Enter a valid recipient." },
                { status: 400 },
            );
        }

        // Optional alias as the From identity.
        let fromEmail = sender.email;
        let fromName = sender.display_name;
        if (typeof body?.aliasId === "string" && body.aliasId) {
            const alias = await getAlias(db, session.tenantId, senderId, body.aliasId);
            if (!alias)
                return NextResponse.json({ ok: false, error: "Unknown alias." }, { status: 400 });
            fromEmail = alias.from_email;
            fromName = alias.from_name;
        }

        // Render (allowing live overrides so the test reflects unsaved edits).
        const subject = typeof body?.subject === "string" ? body.subject : tmpl.subject;
        const contentHtml =
            typeof body?.contentHtml === "string" ? body.contentHtml : tmpl.content_html;
        const bgColor = typeof body?.bgColor === "string" ? body.bgColor : tmpl.bg_color;
        const vars = body?.vars && typeof body.vars === "object" ? body.vars : {};
        const product = tmpl.product_id
            ? await getProduct(db, session.tenantId, tmpl.product_id)
            : null;
        const rendered = renderTemplate(
            { subject, content_html: contentHtml, background_color: bgColor },
            vars,
            product ? productToFooter(product) : null,
        );

        let pass: string;
        try {
            pass = await decryptSecret(sender.app_password_enc);
        } catch {
            return NextResponse.json(
                { ok: false, error: "Could not decrypt the sender's app password." },
                { status: 500 },
            );
        }

        const result = await relayViaSender({
            host: sender.smtp_host,
            port: sender.smtp_port,
            secure: sender.smtp_secure,
            user: sender.username || sender.email,
            pass,
            from: fromEmail,
            fromName,
            to,
            subject: rendered.subject || "(no subject)",
            html: rendered.html,
            text: rendered.text,
        });

        if (result.ok) {
            return NextResponse.json({
                ok: true,
                to,
                subject: rendered.subject,
                response: result.response ?? null,
            });
        }
        return NextResponse.json(
            { ok: false, error: result.error || "Send failed." },
            { status: 502 },
        );
    } catch (e: any) {
        // Surface the real reason instead of a generic 500 (which the UI shows
        // as "Test send failed.").
        console.error("[templates/test] error:", e);
        return NextResponse.json(
            { ok: false, error: `Send error: ${String(e?.message || e)}` },
            { status: 500 },
        );
    }
}
