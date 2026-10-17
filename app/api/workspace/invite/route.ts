export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import {
    type Role,
    ensureWorkspaceLink,
    getWorkspaceLink,
    inviteToPublic,
    normalizeRole,
    revokeWorkspaceLinks,
    rotateWorkspaceLink,
    setWorkspaceLinkRole,
} from "@/lib/workspace";
import { guard } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

function linkPayload(request: NextRequest, link: Awaited<ReturnType<typeof getWorkspaceLink>>) {
    if (!link) return null;
    return { ...inviteToPublic(link), url: `${request.nextUrl.origin}/join/${link.token}` };
}

/**
 * POST /api/workspace/invite — the workspace's single invite link (admin+).
 * Body: { role?, rotate?: boolean }.
 *   - rotate=true  → generate a fresh link, immediately killing the old token.
 *   - otherwise    → ensure a link exists (creating one if absent); if `role`
 *                    differs, update the role the link grants (same token).
 */
export async function POST(request: NextRequest) {
    const g = await guard(request, "admin");
    if (!g.ok) return g.response;

    let body: { role?: string; rotate?: boolean } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        // tolerate empty body — defaults to ensure-with-viewer
    }

    const role = normalizeRole(body.role) as Role;
    if (role === "owner") {
        return NextResponse.json({ error: "cannot_invite_owner" }, { status: 400 });
    }

    const db = await getDatabase();

    if (body.rotate) {
        const link = await rotateWorkspaceLink(db, g.session.tenantId, role, g.session.uid);
        return NextResponse.json({ ok: true, rotated: true, invite: linkPayload(request, link) });
    }

    const link = await ensureWorkspaceLink(db, g.session.tenantId, role, g.session.uid);
    // If the caller passed a role and it differs from the existing link, update it.
    if (body.role && link.role !== role) {
        await setWorkspaceLinkRole(db, g.session.tenantId, role);
        const updated = await getWorkspaceLink(db, g.session.tenantId);
        return NextResponse.json({ ok: true, invite: linkPayload(request, updated) });
    }
    return NextResponse.json({ ok: true, invite: linkPayload(request, link) });
}

/** DELETE /api/workspace/invite — disable the link (revoke it entirely). */
export async function DELETE(request: NextRequest) {
    const g = await guard(request, "admin");
    if (!g.ok) return g.response;
    const db = await getDatabase();
    await revokeWorkspaceLinks(db, g.session.tenantId);
    return NextResponse.json({ ok: true });
}
