/**
 * GET /api/cf/d1/:id/tables — list tables (+ row counts best-effort) in a D1 DB.
 * Admin-gated, read-only.
 */

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
    try {
        const env = await cfRest<any>(
            await acctPath(`/d1/database/${id}/query`),
            {
                method: "POST",
                body: JSON.stringify({
                    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
                    params: [],
                }),
            },
        );
        const rows = env.result?.[0]?.results || [];
        const tables = rows.map((r: any) => r.name as string);
        return NextResponse.json({ tables });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 400 },
        );
    }
}
