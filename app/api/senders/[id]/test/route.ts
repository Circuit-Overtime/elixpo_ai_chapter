export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { decryptSecret } from "@/lib/encryption";
import { getAlias, getSender, markSenderVerified } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { relayViaSender } from "@/lib/smtp-sender";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/senders/:id/test — send a verification email through this sender.
 * Defaults to sending to the sender's own address. Proves the credentials work
 * end-to-end via the SMTP sender Worker before any real mail is sent.
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
        /* optional body */
    }

    const db = await getDatabase();
    const sender = await getSender(db, session.tenantId, id);
    if (!sender) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const to = typeof body?.to === "string" && body.to.trim() ? body.to.trim() : sender.email;
    if (!EMAIL_RE.test(to)) {
        return NextResponse.json({ ok: false, error: "Enter a valid recipient." }, { status: 400 });
    }

    // Optionally send "as" one of the sender's aliases (support@, accounts@…).
    let fromEmail = sender.email;
    let fromName = sender.display_name;
    if (typeof body?.aliasId === "string" && body.aliasId) {
        const alias = await getAlias(db, session.tenantId, id, body.aliasId);
        if (!alias) {
            return NextResponse.json({ ok: false, error: "Unknown alias." }, { status: 400 });
        }
        fromEmail = alias.from_email;
        fromName = alias.from_name;
    }

    let pass: string;
    try {
        pass = await decryptSecret(sender.app_password_enc);
    } catch {
        return NextResponse.json(
            { ok: false, error: "Could not decrypt the stored app password." },
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
        subject: "Your mail.elixpo sender is working ✅",
        html: testHtml(sender.email),
        text: `This is a test from mail.elixpo. Your sender ${sender.email} is configured correctly and can deliver mail.`,
    });

    if (result.ok) {
        await markSenderVerified(db, session.tenantId, id);
        return NextResponse.json({ ok: true, to, response: result.response ?? null });
    }
    return NextResponse.json({ ok: false, error: result.error || "Send failed." }, { status: 502 });
}

function testHtml(email: string): string {
    return `<!doctype html><html><body style="margin:0;background:#0b0d12;font-family:Arial,Helvetica,sans-serif;color:#f5f5f4;padding:32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#13161d;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:28px">
<tr><td>
<div style="font-size:18px;font-weight:700;margin-bottom:8px">mail.elixpo — sender verified ✅</div>
<div style="font-size:14px;line-height:1.6;color:rgba(245,245,244,0.7)">
Your sender <strong style="color:#c4b5fd">${email}</strong> is configured correctly and just delivered this test email through mail.elixpo. You're ready to design templates and trigger sends.
</div>
</td></tr></table>
</td></tr></table>
</body></html>`;
}
