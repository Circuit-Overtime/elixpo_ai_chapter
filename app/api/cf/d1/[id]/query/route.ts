/**
 * POST /api/cf/d1/:id/query — run a SQL query against a D1 database.
 * Admin-gated. Phase 1 is READ-ONLY (SELECT / WITH / EXPLAIN / PRAGMA); writes
 * land in Phase 3 behind explicit confirmation. Every query is audit-logged.
 */

export const runtime = "edge";

import { recordAction } from "@/lib/audit";
import { acctPath, cfRest } from "@/lib/cloudflare-api";
import { requireAdmin } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

const READ_ONLY = /^\s*(select|with|explain|pragma)\b/i;

export async function POST(
    request: NextRequest,
    ctx: { params: Promise<{ id: string }> },
) {
    const session = await requireAdmin(request);
    if (!session)
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
        sql?: string;
        params?: unknown[];
    };
    const sql = String(body?.sql || "").trim();
    const params = Array.isArray(body?.params) ? body.params : [];

    if (!sql)
        return NextResponse.json({ error: "Empty query" }, { status: 400 });
    if (!READ_ONLY.test(sql)) {
        return NextResponse.json(
            {
                error: "Read-only console: only SELECT / WITH / EXPLAIN / PRAGMA are allowed (writes arrive in Phase 3).",
            },
            { status: 403 },
        );
    }

    try {
        const env = await cfRest<any>(
            await acctPath(`/d1/database/${id}/query`),
            {
                method: "POST",
                body: JSON.stringify({ sql, params }),
            },
        );
        const first = env.result?.[0] || {};
        await recordAction(session, "d1.query", id, { sql: sql.slice(0, 500) });
        return NextResponse.json({
            results: first.results || [],
            meta: first.meta || null,
            success: true,
        });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 400 },
        );
    }
}
