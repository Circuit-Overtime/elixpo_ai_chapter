export const runtime = "edge";

import { NextResponse } from "next/server";
import { createAuthorizationServerMetadata } from "@/lib/oauth-metadata";

/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), extended with the
 * device authorization endpoint and grant type (RFC 8628) per
 * accounts.elixpo#79. Static per deployment — no per-request DB/auth work,
 * so it's safe to serve without rate limiting.
 */
export async function GET() {
    const metadata = createAuthorizationServerMetadata(
        process.env.NEXT_PUBLIC_APP_URL,
    );

    return NextResponse.json(metadata, {
        headers: {
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    });
}
