export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getOAuthConfig } from "@/lib/oauth-config";
import { generateRandomString } from "@/lib/webcrypto";

/**
 * GET /api/auth/oauth/[provider]?mode=login|register
 * Initiates OAuth flow by generating state, setting cookies, and redirecting to provider.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const { provider } = await params;
    const mode = request.nextUrl.searchParams.get("mode") || "login";
    const next = request.nextUrl.searchParams.get("next") || "";

    if (mode !== "login" && mode !== "register") {
        return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const config = getOAuthConfig(
        provider.toLowerCase(),
        {
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
            GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
            GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
            DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
            DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
            MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
            MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        },
        origin,
    );

    if (!config) {
        return NextResponse.redirect(
            new URL(
                `/error?error=unsupported_provider&description=Provider+${provider}+is+not+supported`,
                request.url,
            ),
        );
    }

    const state = generateRandomString(32);

    // Build the provider authorization URL with state
    const authUrl = new URL(config.authorizationEndpoint);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", config.scopes.join(" "));

    const response = NextResponse.redirect(authUrl.toString());

    // Set oauth_state cookie so the callback can validate it
    response.cookies.set("oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60, // 10 minutes
        path: "/",
    });

    // Store the mode so the callback knows whether to create a new user or log in existing one
    response.cookies.set("oauth_mode", mode, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60,
        path: "/",
    });

    // Store the ?next= redirect so the callback can continue the OAuth flow
    if (next) {
        response.cookies.set("oauth_next", next, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 10 * 60,
            path: "/",
        });
    }

    return response;
}
