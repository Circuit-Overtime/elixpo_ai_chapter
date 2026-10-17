export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getSender, setDefaultSender, toPublic } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/** POST /api/senders/:id/default — mark this sender as the tenant default. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getSender(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const row = await setDefaultSender(db, session.tenantId, id);
    return NextResponse.json({ ok: true, sender: row ? toPublic(row) : null });
}
