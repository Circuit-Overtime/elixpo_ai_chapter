export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getOrBootstrapMerchant } from "@/lib/merchant";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { exchangeCodeForUser } from "@/lib/sso";

const STATE_COOKIE = "pay_oauth_state";

/** GET /api/auth/callback — Accounts redirects here with ?code&state. */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const err = sp.get("error");
    const origin = request.nextUrl.origin;

    if (err) {
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(err)}`,
        );
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
        const merchant = await getOrBootstrapMerchant(
            db,
            user.id,
            user.email,
            user.displayName || user.username || undefined,
        );

        const token = await signSession({
            uid: user.id,
            email: user.email,
            name: user.displayName || user.username || user.email,
            avatar: user.avatar ?? null,
            merchantId: merchant.id,
        });

        const dest = next.startsWith("/") ? next : "/dashboard";
        const res = NextResponse.redirect(`${origin}${dest}`);
        res.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 86400,
            path: "/",
        });
        res.cookies.delete(STATE_COOKIE);
        return res;
    } catch (e: any) {
        console.error("[auth/callback] error:", e);
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent("sso_failed")}`,
        );
    }
}
