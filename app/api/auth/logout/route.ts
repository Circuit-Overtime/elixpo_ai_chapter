export const runtime = "edge";

import { SESSION_COOKIE } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/auth/logout — clear the session cookie and return home. */
export async function GET(request: NextRequest) {
    const res = NextResponse.redirect(`${request.nextUrl.origin}/`);
    res.cookies.delete(SESSION_COOKIE);
    return res;
}
