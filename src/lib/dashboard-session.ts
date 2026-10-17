/**
 * Server helper for dashboard pages. Reads the signed session cookie via
 * next/headers, verifies it, and redirects to /login if absent or invalid.
 *
 * Use only in server components / route handlers that run on the edge:
 *   export const runtime = "edge";
 *   const session = await requireDashboardSession();
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, type SessionData, verifySession } from "./session";

/** Returns the verified session, or redirects to /login (never returns null). */
export async function requireDashboardSession(): Promise<SessionData> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = await verifySession(token);
    if (!session) {
        redirect("/login");
    }
    return session;
}
