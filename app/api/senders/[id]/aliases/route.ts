export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { addAlias, aliasToPublic, getSender, listAliases } from "@/lib/senders";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/senders/:id/aliases — From identities configured on a sender. */
export async function GET(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const db = await getDatabase();
    const sender = await getSender(db, session.tenantId, id);
    if (!sender) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const aliases = await listAliases(db, session.tenantId, id);
    return NextResponse.json({ ok: true, aliases: aliases.map(aliasToPublic) });
}

/** POST /api/senders/:id/aliases — add a From identity (support@, accounts@…). */
export async function POST(request: NextRequest, { params }: Ctx) {
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

    const fromEmail = typeof body?.fromEmail === "string" ? body.fromEmail.trim() : "";
    if (!EMAIL_RE.test(fromEmail)) {
        return NextResponse.json(
            { error: "invalid_email", message: "Enter a valid From address for the alias." },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const sender = await getSender(db, session.tenantId, id);
    if (!sender) return NextResponse.json({ error: "not_found" }, { status: 404 });

    try {
        const alias = await addAlias(
            db,
            session.tenantId,
            id,
            fromEmail,
            typeof body?.fromName === "string" ? body.fromName : null,
        );
        return NextResponse.json({ ok: true, alias: aliasToPublic(alias) }, { status: 201 });
    } catch (e: any) {
        if (String(e?.message || "").includes("UNIQUE")) {
            return NextResponse.json(
                {
                    error: "duplicate",
                    message: "That From address is already an alias on this sender.",
                },
                { status: 409 },
            );
        }
        console.error("[aliases] create error:", e);
        return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
}
