export const runtime = "edge";

import { NextResponse } from "next/server";
import { getPublicJwk } from "@/lib/jwt";

export async function GET() {
    try {
        return NextResponse.json(
            { keys: [await getPublicJwk()] },
            {
                headers: {
                    "Cache-Control":
                        "public, max-age=3600, stale-while-revalidate=300",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    } catch (error) {
        console.error(
            "[JWKS] Unable to export the configured public signing key",
            error instanceof Error ? error.message : "unknown error",
        );
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}
