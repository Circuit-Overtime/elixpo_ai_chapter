export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { clearAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import { revokeRefreshToken } from "@/lib/db";
import { hashString } from "@/lib/webcrypto";

/**
 * POST /api/auth/logout
 * Logout user and revoke all tokens
 *
 * Features:
 * - Revoke refresh token in database
 * - Clear all authentication cookies
 * - Support logout_redirect_uri for SSO
 *
 * Request body (optional):
 * {
 *   "refresh_token": "jwt_token", // If not using cookies
 *   "logout_redirect_uri": "https://app.example.com/logged-out"
 * }
 */
// Only echo a logout-redirect URL back to the client if it points to an
// allowed destination. The SSO flow expects redirects only to first-party
// hosts (elixpo.com + subdomains). Anything else is dropped — silently —
// to prevent us from being abused as an open-redirect oracle for phishing.
function safeRedirectFor(input: unknown): string | undefined {
    if (typeof input !== "string" || input.length === 0) return undefined;
    try {
        const u = new URL(input);
        if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
        if (u.hostname === "elixpo.com" || u.hostname.endsWith(".elixpo.com")) {
            return input;
        }
        // localhost is permitted in dev only, never in prod responses.
        if (
            process.env.NODE_ENV !== "production" &&
            (u.hostname === "localhost" || u.hostname === "127.0.0.1")
        ) {
            return input;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: any = await request.json().catch(() => ({}));
        const refreshToken =
            body.refresh_token || request.cookies.get("refresh_token")?.value;
        const logoutRedirectUri = safeRedirectFor(body.logout_redirect_uri);

        // Revoke refresh token in database if available
        if (refreshToken) {
            try {
                const db = await getDatabase();
                const tokenHash = await hashString(refreshToken);
                await revokeRefreshToken(db, tokenHash);
                console.log("[Logout] Refresh token revoked");
            } catch (error) {
                console.error("[Logout] Error revoking token:", error);
                // Don't fail logout if DB is unavailable - still clear cookies
            }
        }

        // Clear all auth cookies
        const response = NextResponse.json(
            {
                message: "Successfully logged out",
                redirect: logoutRedirectUri || undefined,
            },
            { status: 200 },
        );

        // Clear all authentication cookies with secure settings
        response.cookies.set("access_token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });

        response.cookies.set("refresh_token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });

        response.cookies.set("user_id", "", {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });
        clearAccountSessionsCookie(response);

        // Clear session/state cookies if present
        response.cookies.set("oauth_state", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });

        response.cookies.set("oauth_pkce_verifier", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("[Logout] Error:", error);
        return NextResponse.json(
            { error: "Failed to logout" },
            { status: 500 },
        );
    }
}
