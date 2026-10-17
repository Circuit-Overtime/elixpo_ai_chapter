export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getSession } from "@/lib/session";
import { deleteWebhook, getWebhook, updateWebhook, webhookToPublic } from "@/lib/webhooks";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/webhooks/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const db = await getDatabase();
    const row = await getWebhook(db, session.tenantId, id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, webhook: webhookToPublic(row) });
}

/** PATCH /api/webhooks/:id — rename or enable/disable. Body: { name?, status? }. */
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
    const existing = await getWebhook(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const row = await updateWebhook(db, session.tenantId, id, {
        name: typeof body?.name === "string" ? body.name : undefined,
        status: body?.status === "active" || body?.status === "disabled" ? body.status : undefined,
    });
    return NextResponse.json({ ok: true, webhook: row ? webhookToPublic(row) : null });
}

/** DELETE /api/webhooks/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getWebhook(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await deleteWebhook(db, session.tenantId, id);
    return NextResponse.json({ ok: true });
}
