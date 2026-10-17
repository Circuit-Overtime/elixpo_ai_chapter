export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import { exchangeCodeForUser } from "@/lib/sso";
import { getOrBootstrapTenant } from "@/lib/tenant";
import { getMembership, linkUserToMemberships } from "@/lib/workspace";
import { type NextRequest, NextResponse } from "next/server";

const STATE_COOKIE = "mail_oauth_state";

/** GET /api/auth/callback — Accounts redirects here with ?code&state. */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const err = sp.get("error");
    const origin = request.nextUrl.origin;

    if (err) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(err)}`);
    }
    if (!code || !state) {
        return NextResponse.redirect(`${origin}/login?error=missing_code`);
    }

    // Validate the state cookie (CSRF).
    const cookie = request.cookies.get(STATE_COOKIE)?.value || "";
    const [savedState, next = "/dashboard"] = cookie.split("|");
    if (!savedState || savedState !== state) {
        return NextResponse.redirect(`${origin}/login?error=bad_state`);
    }

    try {
        // Must exactly match the redirect_uri sent in /api/auth/login.
        const redirectUri = `${origin}/api/auth/callback`;
        const user = await exchangeCodeForUser(code, redirectUri);

        const db = await getDatabase();
        const tenant = await getOrBootstrapTenant(
            db,
            user.id,
            user.email,
            user.displayName || user.username || undefined,
        );

        // Attach this uid to any membership rows that were keyed only by email
        // (e.g. accepted invites) and refresh the cached name/avatar, then
        // resolve the active-workspace role.
        await linkUserToMemberships(
            db,
            user.id,
            user.email,
            user.displayName || user.username || undefined,
            user.avatar ?? null,
        );
        const membership = await getMembership(db, tenant.id, user.id, user.email);

        const token = await signSession({
            uid: user.id,
            email: user.email,
            name: user.displayName || user.username || user.email,
            avatar: user.avatar ?? null,
            tenantId: tenant.id,
            role: membership?.role || "owner",
        });

        const dest = next.startsWith("/") ? next : "/dashboard";
        const res = NextResponse.redirect(`${origin}${dest}`);
        res.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: SESSION_TTL_SECONDS,
            path: "/",
        });
        res.cookies.delete(STATE_COOKIE);
        return res;
    } catch (e: any) {
        console.error("[auth/callback] error:", e);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("sso_failed")}`);
    }
}
