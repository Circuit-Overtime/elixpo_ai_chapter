export const runtime = "edge";

import { buildAuthorizeUrl } from "@/lib/sso";
import { type NextRequest, NextResponse } from "next/server";

const STATE_COOKIE = "mail_oauth_state";

/** GET /api/auth/login — kick off the Elixpo Accounts authorization-code flow. */
export async function GET(request: NextRequest) {
    const next = request.nextUrl.searchParams.get("next") || "/dashboard";
    // Derive the callback from the actual request origin so it's correct in
    // every environment (localhost in dev, mail.elixpo.com in prod) without
    // depending on env vars. Both variants are registered on the OAuth client.
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;

    const state = crypto.randomUUID();
    const url = await buildAuthorizeUrl(state, redirectUri);

    const res = NextResponse.redirect(url);
    // Bind state + post-login destination to a short-lived cookie (CSRF guard).
    res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
    });
    return res;
}
