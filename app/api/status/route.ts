/**
 * JSON status feed consumed by the client view's refresh button. Server-side
 * it's the same KV-cached buildStatus() the SSR page uses, so a refresh bypasses
 * only the client's localStorage cache — not the ~45-60s server KV cache.
 */

import { buildStatus } from "@/lib/status-data";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
    const data = await buildStatus();
    return Response.json(data, {
        headers: { "Cache-Control": "no-store" },
    });
}
