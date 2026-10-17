export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { deleteSender, getSender, toPublic, updateSender } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/senders/:id — one sender (no secrets). */
export async function GET(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const db = await getDatabase();
    const row = await getSender(db, session.tenantId, id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, sender: toPublic(row) });
}

/** PATCH /api/senders/:id — update fields; app password re-encrypted if sent. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const db = await getDatabase();
    const existing = await getSender(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const port = body?.smtpPort != null ? Number(body.smtpPort) : undefined;
    if (port != null && (!Number.isFinite(port) || port < 1 || port > 65535)) {
        return NextResponse.json({ error: "invalid_port" }, { status: 400 });
    }

    const row = await updateSender(db, session.tenantId, id, {
        displayName: typeof body?.displayName === "string" ? body.displayName : undefined,
        smtpHost: typeof body?.smtpHost === "string" ? body.smtpHost : undefined,
        smtpPort: port,
        smtpSecure: typeof body?.smtpSecure === "string" ? body.smtpSecure : undefined,
        username: typeof body?.username === "string" ? body.username : undefined,
        appPassword:
            typeof body?.appPassword === "string" && body.appPassword
                ? body.appPassword
                : undefined,
        status: body?.status === "active" || body?.status === "disabled" ? body.status : undefined,
    });
    return NextResponse.json({ ok: true, sender: row ? toPublic(row) : null });
}

/** DELETE /api/senders/:id — remove a sender (detaches it from products/templates). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getSender(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await deleteSender(db, session.tenantId, id);
    return NextResponse.json({ ok: true });
}
