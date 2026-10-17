/** GET /api/cf/kv/:id/keys?prefix= — list keys in a KV namespace. Admin-gated. */

export const runtime = "edge";

import { acctPath, cfRest } from "@/lib/cloudflare-api";
import { requireAdmin } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    ctx: { params: Promise<{ id: string }> },
) {
    const session = await requireAdmin(request);
    if (!session)
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const prefix = new URL(request.url).searchParams.get("prefix") || "";
    try {
        const qs = `limit=100${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ""}`;
        const env = await cfRest<{ name: string; expiration?: number }[]>(
            await acctPath(`/storage/kv/namespaces/${id}/keys?${qs}`),
        );
        return NextResponse.json({ keys: env.result || [] });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 400 },
        );
    }
}
