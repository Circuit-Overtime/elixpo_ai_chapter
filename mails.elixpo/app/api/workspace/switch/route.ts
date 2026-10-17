export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, getSession, signSession } from "@/lib/session";
import { getMembership } from "@/lib/workspace";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/workspace/switch — make a different workspace active.
 * Body: { tenantId }. Re-issues the session cookie with the new tenant + role
 * after verifying the caller is an active member there.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let tenantId = "";
    try {
        const body = (await request.json()) as { tenantId?: string };
        tenantId = (body.tenantId || "").trim();
    } catch {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (!tenantId) {
        return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
    }

    const db = await getDatabase();
    const membership = await getMembership(db, tenantId, session.uid, session.email);
    if (!membership || membership.status !== "active") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const token = await signSession({
        uid: session.uid,
        email: session.email,
        name: session.name,
        avatar: session.avatar ?? null,
        tenantId,
        role: membership.role,
    });

    const res = NextResponse.json({ ok: true, tenantId, role: membership.role });
    res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_TTL_SECONDS,
        path: "/",
    });
    return res;
}
