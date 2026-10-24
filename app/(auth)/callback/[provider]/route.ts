export const runtime = "edge";

import type { NextRequest } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const { provider } = await params;

    // Construct the API route URL with all query parameters
    const apiUrl = new URL(`/api/auth/callback/${provider}`, request.url);
    apiUrl.search = request.nextUrl.search;

    // Call the API route and return its response by proxying the request
    const res = await fetch(apiUrl.toString(), {
        method: "GET",
        headers: request.headers,
        redirect: "manual",
    });

    return new Response(res.body, {
        status: res.status,
        headers: res.headers,
    });
}
