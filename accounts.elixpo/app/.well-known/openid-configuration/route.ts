export const runtime = "edge";

import { NextResponse } from "next/server";
import { createAuthorizationServerMetadata } from "@/lib/oauth-metadata";

export async function GET() {
    return NextResponse.json(
        createAuthorizationServerMetadata(process.env.NEXT_PUBLIC_APP_URL),
        {
            headers: {
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        },
    );
}
