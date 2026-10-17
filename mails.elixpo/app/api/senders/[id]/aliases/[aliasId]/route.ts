export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { deleteAlias, getAlias } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; aliasId: string }> };

/** DELETE /api/senders/:id/aliases/:aliasId — remove a From identity. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id, aliasId } = await params;

    const db = await getDatabase();
    const alias = await getAlias(db, session.tenantId, id, aliasId);
    if (!alias) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await deleteAlias(db, session.tenantId, id, aliasId);
    return NextResponse.json({ ok: true });
}
