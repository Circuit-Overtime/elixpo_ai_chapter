export const runtime = "edge";

import { NextResponse } from "next/server";

/**
 * GET /api/auth/config
 *
 * Get authentication configuration
 * This endpoint returns public configuration for client-side use
 */
export async function GET() {
    try {
        // Get authorization timeout from environment or use default
        const authorizationTimeoutSeconds = parseInt(
            process.env.AUTHORIZATION_TIMEOUT_SECONDS || "600",
            10,
        );

        return NextResponse.json({
            authorizationTimeoutSeconds,
            features: {
                oauth: true,
                oidc: true,
                emailVerification: true,
                socialLogin: true,
            },
            providers: {
                google: !!process.env.GOOGLE_CLIENT_ID,
                github: !!process.env.GITHUB_CLIENT_ID,
            },
        });
    } catch (error) {
        console.error("[Auth Config] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch configuration" },
            { status: 500 },
        );
    }
}
