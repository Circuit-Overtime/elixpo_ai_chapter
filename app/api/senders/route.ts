export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { createSender, listSenders, toPublic } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /api/senders — list the tenant's senders (no secrets). */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const rows = await listSenders(db, session.tenantId);
    return NextResponse.json({ ok: true, senders: rows.map(toPublic) });
}

/** POST /api/senders — connect a new sender (email + app password). */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const appPassword = typeof body?.appPassword === "string" ? body.appPassword : "";

    if (!EMAIL_RE.test(email)) {
        return NextResponse.json(
            { error: "invalid_email", message: "Enter a valid sender email address." },
            { status: 400 },
        );
    }
    if (!appPassword || appPassword.length < 4) {
        return NextResponse.json(
            { error: "invalid_password", message: "An app password is required." },
            { status: 400 },
        );
    }

    const port = body?.smtpPort != null ? Number(body.smtpPort) : undefined;
    if (port != null && (!Number.isFinite(port) || port < 1 || port > 65535)) {
        return NextResponse.json({ error: "invalid_port" }, { status: 400 });
    }

    const db = await getDatabase();
    try {
        const row = await createSender(db, session.tenantId, {
            email,
            appPassword,
            displayName: typeof body?.displayName === "string" ? body.displayName : null,
            smtpHost: typeof body?.smtpHost === "string" ? body.smtpHost : undefined,
            smtpPort: port,
            smtpSecure: typeof body?.smtpSecure === "string" ? body.smtpSecure : undefined,
            username: typeof body?.username === "string" ? body.username : null,
        });
        return NextResponse.json({ ok: true, sender: toPublic(row) }, { status: 201 });
    } catch (e: any) {
        // UNIQUE(tenant_id, email) collision is the common case.
        if (String(e?.message || "").includes("UNIQUE")) {
            return NextResponse.json(
                { error: "duplicate", message: "A sender with that email already exists." },
                { status: 409 },
            );
        }
        console.error("[senders] create error:", e);
        return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
}
