export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { SESSION_COOKIE, getSession, signSession } from "@/lib/session";
import { acceptInvite, getMembership } from "@/lib/workspace";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/workspace/join — accept an invite link.
 * Body: { token }. Email-specific invites join immediately and switch the
 * active workspace; open links create a pending join request for admin approval.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let token = "";
    try {
        const body = (await request.json()) as { token?: string };
        token = (body.token || "").trim();
    } catch {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const db = await getDatabase();
    const result = await acceptInvite(
        db,
        token,
        session.uid,
        session.email,
        session.name,
        session.avatar ?? null,
    );
    if (!result.ok) {
        return NextResponse.json({ error: result.error || "invalid" }, { status: 400 });
    }

    // Pending join request — nothing to switch into yet.
    if (result.pending) {
        return NextResponse.json({ ok: true, pending: true });
    }

    // Direct join — make the new workspace active with the granted role.
    const tenantId = result.tenantId as string;
    const m = await getMembership(db, tenantId, session.uid, session.email);
    const token2 = await signSession({
        uid: session.uid,
        email: session.email,
        name: session.name,
        avatar: session.avatar ?? null,
        tenantId,
        role: m?.role || "viewer",
    });

    const res = NextResponse.json({ ok: true, pending: false, tenantId });
    res.cookies.set(SESSION_COOKIE, token2, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 86400,
        path: "/",
    });
    return res;
}
