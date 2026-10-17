export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getSession } from "@/lib/session";
import { getTenant } from "@/lib/tenant";
import { requireAdminRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const MAX_NAME = 80;

/** GET /api/tenant — current workspace (the signed-in user's tenant). */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const db = await getDatabase();
    const tenant = await getTenant(db, session.tenantId);
    if (!tenant) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
        ok: true,
        tenant: { id: tenant.id, name: tenant.name, email: tenant.email },
    });
}

/** PATCH /api/tenant — rename the signed-in user's workspace. */
export async function PATCH(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const denied = await requireAdminRole(session);
    if (denied) return denied;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > MAX_NAME) {
        return NextResponse.json(
            { error: "invalid_name", message: `Workspace name must be 1–${MAX_NAME} characters.` },
            { status: 400 },
        );
    }

    // Scoped to the caller's own tenant — they can never rename another.
    const db = await getDatabase();
    await db
        .prepare("UPDATE tenants SET name = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(name, session.tenantId)
        .run();

    return NextResponse.json({ ok: true, tenant: { id: session.tenantId, name } });
}
