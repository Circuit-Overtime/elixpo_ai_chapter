/** GET /api/cf/kv/:id/value?key= — read a single KV value. Admin-gated.
 * The values endpoint returns the raw stored body (not the CF JSON envelope),
 * so we fetch it directly. */

export const runtime = "edge";

import { getAccountId } from "@/lib/cloudflare-api";
import { requireEnv } from "@/lib/env";
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
    const key = new URL(request.url).searchParams.get("key");
    if (!key)
        return NextResponse.json({ error: "missing key" }, { status: 400 });

    try {
        const token = await requireEnv("CF_API_TOKEN");
        const acc = await getAccountId();
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${id}/values/${encodeURIComponent(key)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 404) return NextResponse.json({ value: null });
        if (!res.ok)
            return NextResponse.json(
                { error: `KV read failed (${res.status})` },
                { status: 400 },
            );
        const value = await res.text();
        return NextResponse.json({ value: value.slice(0, 20000) });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 400 },
        );
    }
}
