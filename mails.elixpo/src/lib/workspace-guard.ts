/**
 * Role guards for workspace API routes. The active-workspace role is resolved
 * LIVE from the DB (`workspace_members`) on every request — not read from the
 * session cookie — so an admin's role/removal change takes effect immediately,
 * without the affected user needing to re-login. Returns a 401/403 response to
 * short-circuit, or the session to proceed.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./d1-client";
import { type SessionData, getSession, sessionRole } from "./session";
import { type Role, can, getMembership, roleAtLeast } from "./workspace";

/**
 * The caller's current role in their active workspace, read live from the DB.
 * Returns null when there is no *active* membership (removed/pending → no
 * access). Falls back to the cookie role only for legacy sessions whose
 * workspace predates the membership table (no row at all).
 */
export async function resolveActiveRole(session: SessionData): Promise<string | null> {
    try {
        const db = await getDatabase();
        const membership = await getMembership(db, session.tenantId, session.uid, session.email);
        if (membership) return membership.status === "active" ? membership.role : null;
        // No membership row at all → pre-migration cookie; trust it as a fallback.
        return sessionRole(session);
    } catch {
        return sessionRole(session);
    }
}

/**
 * Gate a mutating content handler (senders/products/templates/webhooks/sends) on
 * write access. Viewers are read-only. Returns a 403 response to short-circuit,
 * or null to proceed. Call (awaited) right after the `getSession` null-check.
 */
export async function requireWriteRole(session: SessionData): Promise<NextResponse | null> {
    const role = await resolveActiveRole(session);
    if (!role || !can.editContent(role)) {
        return NextResponse.json(
            { error: "forbidden", message: "Your role in this workspace is read-only." },
            { status: 403 },
        );
    }
    return null;
}

/** Gate on workspace-admin (member/cosmetics management). */
export async function requireAdminRole(session: SessionData): Promise<NextResponse | null> {
    const role = await resolveActiveRole(session);
    if (!role || !can.manageWorkspace(role)) {
        return NextResponse.json(
            { error: "forbidden", message: "Only workspace admins can do this." },
            { status: 403 },
        );
    }
    return null;
}

export type Guarded =
    | { ok: true; session: SessionData; role: string }
    | { ok: false; response: NextResponse };

export async function guard(request: NextRequest, min: Role): Promise<Guarded> {
    const session = await getSession(request);
    if (!session) {
        return {
            ok: false,
            response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
        };
    }
    const role = await resolveActiveRole(session);
    if (!role || !roleAtLeast(role, min)) {
        return {
            ok: false,
            response: NextResponse.json({ error: "forbidden", role }, { status: 403 }),
        };
    }
    return { ok: true, session, role };
}
