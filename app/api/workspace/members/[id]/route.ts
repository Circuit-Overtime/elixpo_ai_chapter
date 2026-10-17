export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import {
    type Role,
    countActiveAdmins,
    getMember,
    normalizeRole,
    setMemberStatus,
    updateMemberRole,
} from "@/lib/workspace";
import { guard } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/workspace/members/[id] — admin actions on a member.
 * Body: { role } to change role, or { action: "approve" } to admit a pending
 * join request. Owners can't be modified.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const g = await guard(request, "admin");
    if (!g.ok) return g.response;
    const { id } = await ctx.params;

    let body: { role?: string; action?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const db = await getDatabase();
    const member = await getMember(db, g.session.tenantId, id);
    if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (member.role === "owner") {
        return NextResponse.json({ error: "owner_immutable" }, { status: 400 });
    }

    if (body.action === "approve") {
        await setMemberStatus(db, g.session.tenantId, id, "active");
        return NextResponse.json({ ok: true });
    }

    if (body.role) {
        const role = normalizeRole(body.role) as Role;
        if (role === "owner") {
            return NextResponse.json({ error: "cannot_set_owner" }, { status: 400 });
        }
        await updateMemberRole(db, g.session.tenantId, id, role);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "no_op" }, { status: 400 });
}

/** DELETE /api/workspace/members/[id] — remove a member (admin+, never an owner). */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const g = await guard(request, "admin");
    if (!g.ok) return g.response;
    const { id } = await ctx.params;

    const db = await getDatabase();
    const member = await getMember(db, g.session.tenantId, id);
    if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (member.role === "owner") {
        return NextResponse.json({ error: "owner_immutable" }, { status: 400 });
    }
    // Don't strip the last admin/owner of management rights.
    if (
        member.role === "admin" &&
        member.status === "active" &&
        (await countActiveAdmins(db, g.session.tenantId)) <= 1
    ) {
        return NextResponse.json({ error: "last_admin" }, { status: 400 });
    }

    await setMemberStatus(db, g.session.tenantId, id, "removed");
    return NextResponse.json({ ok: true });
}
