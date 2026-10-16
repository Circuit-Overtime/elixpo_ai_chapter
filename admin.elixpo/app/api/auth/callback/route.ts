/**
 * GET /api/auth/callback — Elixpo Accounts SSO redirect target.
 *
 * 1. Validate the CSRF `state` against the cookie.
 * 2. Exchange the authorization code for tokens.
 * 3. Fetch the profile from /api/auth/me, then check the `role` column in
 *    elixpo_auth (role = 'admin') as the source of truth for admin access.
 * 4. Reject non-admins (redirect to /denied, no session issued).
 * 5. Issue the signed `admin_session` cookie and land on /dashboard.
 */

export const runtime = "edge";

import { isAdminByRole } from "@/lib/admin";
import {
    type AccountsProfile,
    type TokenResponse,
    exchangeCode,
    fetchMe,
} from "@/lib/oauth";
import {
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    STATE_COOKIE,
    signSession,
} from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

function redirectTo(request: NextRequest, path: string) {
    return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    const secure = url.protocol === "https:";

    if (oauthError) {
        return redirectTo(
            request,
            `/denied?reason=${encodeURIComponent(oauthError)}`,
        );
    }

    const cookieState = request.cookies.get(STATE_COOKIE)?.value;
    if (!code || !state || !cookieState || state !== cookieState) {
        return redirectTo(request, "/denied?reason=bad_state");
    }

    let profile: AccountsProfile | null;
    let tokens: TokenResponse;
    try {
        const redirect = new URL("/api/auth/callback", request.url).toString();
        tokens = await exchangeCode(code, redirect);
        profile = await fetchMe(tokens.access_token);
    } catch {
        return redirectTo(request, "/denied?reason=exchange_failed");
    }

    if (!profile) {
        return redirectTo(request, "/denied?reason=no_profile");
    }

    // Admin = role 'admin' in elixpo_auth (source of truth), with the /me flag
    // as a fallback if the DB lookup is unavailable.
    const admin =
        (await isAdminByRole({
            id: String(profile.id || profile.userId || ""),
            email: profile.email,
        })) || profile.isAdmin === true;
    if (!admin) {
        return redirectTo(request, "/denied?reason=not_admin");
    }

    const now = Math.floor(Date.now() / 1000);
    const sessionToken = await signSession({
        uid: String(profile.id || profile.userId || ""),
        email: profile.email,
        name: profile.displayName || profile.username,
        avatar: profile.avatar ?? null,
        isAdmin: true,
        at: tokens.access_token,
        rt: tokens.refresh_token,
        atExp: tokens.expires_in ? now + tokens.expires_in : undefined,
    });

    // Land on the dashboard relative to the current origin (localhost in dev,
    // admin.elixpo.com in prod) so the same code works in both environments.
    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    res.cookies.set(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
}
