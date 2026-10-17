export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { newId } from "@/lib/ids";
import { getSession } from "@/lib/session";
import {
    getWorkspaceInfo,
    getWorkspaceLink,
    inviteToPublic,
    listMembers,
    memberToPublic,
    slugifyWorkspace,
    syncMemberIdentity,
    uniqueSlug,
    updateWorkspace,
} from "@/lib/workspace";
import { guard } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/** POST /api/workspace — create a shared workspace owned by the signed-in user. */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    let body: { name?: string; description?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const name = body.name?.trim() || "";
    if (name.length < 2) {
        return NextResponse.json(
            { error: "invalid_name", message: "Enter a workspace name." },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const tenantId = newId("tenant");
    const memberId = newId("member");
    const slug = await uniqueSlug(db, slugifyWorkspace(name));
    await db.batch([
        db
            .prepare(
                `INSERT INTO tenants (id, name, email, owner_uid, status, slug, description)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
            )
            .bind(
                tenantId,
                name,
                session.email,
                session.uid,
                slug,
                body.description?.trim() || null,
            ),
        db
            .prepare(
                `INSERT INTO workspace_members
             (id, tenant_id, user_uid, email, name, avatar, role, status)
             VALUES (?, ?, ?, ?, ?, ?, 'owner', 'active')`,
            )
            .bind(
                memberId,
                tenantId,
                session.uid,
                session.email.toLowerCase(),
                session.name || null,
                session.avatar || null,
            ),
    ]);
    return NextResponse.json(
        { ok: true, workspace: { id: tenantId, name, slug } },
        { status: 201 },
    );
}

/** GET /api/workspace — overview for the settings page (info + members; link if admin). */
export async function GET(request: NextRequest) {
    const g = await guard(request, "viewer");
    if (!g.ok) return g.response;

    const db = await getDatabase();
    const info = await getWorkspaceInfo(db, g.session.tenantId);
    if (!info) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Keep the viewer's own cached name/avatar fresh from their live session.
    await syncMemberIdentity(
        db,
        g.session.tenantId,
        g.session.uid,
        g.session.email,
        g.session.name,
        g.session.avatar ?? null,
    ).catch(() => {});

    const members = (await listMembers(db, g.session.tenantId)).map(memberToPublic);
    const isAdmin = g.role === "owner" || g.role === "admin";
    const link = isAdmin ? await getWorkspaceLink(db, g.session.tenantId) : null;
    const invite = link
        ? { ...inviteToPublic(link), url: `${request.nextUrl.origin}/join/${link.token}` }
        : null;

    return NextResponse.json({
        role: g.role,
        workspace: {
            id: info.id,
            name: info.name,
            slug: info.slug,
            description: info.description,
            logoUrl: info.logo_url,
        },
        members,
        invite,
    });
}

/** PATCH /api/workspace — update name / slug / description / logo (admin+). */
export async function PATCH(request: NextRequest) {
    const g = await guard(request, "admin");
    if (!g.ok) return g.response;

    let body: {
        name?: string;
        slug?: string;
        description?: string | null;
        logoUrl?: string | null;
    };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const db = await getDatabase();

    // If the slug changed, normalize + ensure uniqueness.
    let slug: string | undefined;
    if (body.slug !== undefined) {
        const desired = slugifyWorkspace(body.slug || "");
        const current = await getWorkspaceInfo(db, g.session.tenantId);
        slug = desired === current?.slug ? desired : await uniqueSlug(db, desired);
    }

    await updateWorkspace(db, g.session.tenantId, {
        name: body.name,
        slug,
        description: body.description,
        logoUrl: body.logoUrl,
    });

    const info = await getWorkspaceInfo(db, g.session.tenantId);
    return NextResponse.json({
        ok: true,
        workspace: info && {
            id: info.id,
            name: info.name,
            slug: info.slug,
            description: info.description,
            logoUrl: info.logo_url,
        },
    });
}
