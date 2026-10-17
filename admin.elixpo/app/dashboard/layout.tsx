/**
 * Dashboard auth wall (server). Reads the admin_session cookie; redirects to the
 * SSO login if it's missing/invalid/non-admin. Edge middleware can't reach the
 * Cloudflare API, so gating lives here (and in requireAdmin on each /api route).
 */

import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type React from "react";
import DashboardChrome from "./chrome";

export const runtime = "edge";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const store = await cookies();
    const session = await verifySession(store.get(SESSION_COOKIE)?.value);
    if (!session || !session.isAdmin) {
        redirect("/api/auth/login");
    }

    return (
        <DashboardChrome
            user={{
                email: session.email,
                name: session.name,
                avatar: session.avatar,
            }}
        >
            {children}
        </DashboardChrome>
    );
}
