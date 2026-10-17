export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";

/**
 * GET /api/sso/verify?token=xxx
 *
 * SSO Token Verification Endpoint (Simple)
 * Query-based verification for simpler integration
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get("token");
        const clientId = searchParams.get("client_id");

        if (!token) {
            return NextResponse.json(
                {
                    valid: false,
                    error: "invalid_request",
                    error_description: "token parameter is required",
                },
                { status: 400 },
            );
        }

        const payload = await verifyJWT(token);

        if (!payload) {
            return NextResponse.json(
                {
                    valid: false,
                    error: "invalid_token",
                    error_description: "Token is invalid or expired",
                },
                { status: 401 },
            );
        }

        console.log(
            `[SSO Verify GET] Token verified for user ${payload.sub}${clientId ? ` by client ${clientId}` : ""}`,
        );

        return NextResponse.json(
            {
                valid: true,
                user: {
                    sub: payload.sub,
                    email: payload.email,
                    provider: payload.provider,
                    iat: payload.iat,
                    exp: payload.exp,
                },
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("[SSO Verify GET] Error:", error);
        return NextResponse.json(
            {
                valid: false,
                error: "server_error",
            },
            { status: 500 },
        );
    }
}

/**
 * POST /api/sso/verify
 *
 * SSO Token Verification Endpoint (Secure)
 * Uses Authorization header for bearer token verification
 *
 * Request Headers:
 * - Authorization: Bearer <access_token> (required)
 * - X-Client-Id: Service identifier (optional)
 *
 * Request Body (optional):
 * {
 *   "token": "eyJ..." (if not using Authorization header)
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        const clientId = request.headers.get("x-client-id");
        const body: any = await request.json().catch(() => ({}));

        let token: string | null = null;

        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (body.token) {
            token = body.token;
        }

        if (!token) {
            return NextResponse.json(
                {
                    valid: false,
                    error: "invalid_request",
                    error_description:
                        "No token provided. Use Authorization header or token field in body.",
                },
                { status: 400 },
            );
        }

        const payload = await verifyJWT(token);

        if (!payload) {
            return NextResponse.json(
                {
                    valid: false,
                    error: "invalid_token",
                    error_description: "Token is invalid or expired",
                },
                { status: 401 },
            );
        }

        console.log(
            `[SSO Verify POST] Token verified for user ${payload.sub}${clientId ? ` by service ${clientId}` : ""}`,
        );

        return NextResponse.json(
            {
                valid: true,
                user: {
                    sub: payload.sub,
                    email: payload.email,
                    provider: payload.provider,
                    iat: payload.iat,
                    exp: payload.exp,
                },
                authenticated_at: new Date(payload.iat * 1000).toISOString(),
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("[SSO Verify POST] Error:", error);
        return NextResponse.json(
            {
                valid: false,
                error: "server_error",
            },
            { status: 500 },
        );
    }
}
