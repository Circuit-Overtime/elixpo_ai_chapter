/**
 * Log out — clear the admin_session cookie and best-effort revoke upstream.
 * Supports POST (from the app) and GET (convenience link).
 */

export const runtime = "edge";

import { ssoLogout } from "@/lib/oauth";
import { SESSION_COOKIE, getSession } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

async function handle(request: NextRequest) {
    const session = await getSession(request);
    if (session?.rt) await ssoLogout(session.rt);

    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
}

export const POST = handle;
export const GET = handle;
