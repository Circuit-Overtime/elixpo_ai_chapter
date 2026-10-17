export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { cleanupExpiredDeviceAuthorizations } from "@/lib/device-auth-service";

/**
 * Deletes expired pending device authorizations in bounded batches.
 *
 * Auth:
 *   Authorization: Bearer <DEVICE_CLEANUP_CRON_SECRET>
 *
 * Runs one bounded batch per call (default 500 rows) so a scheduled trigger
 * with a short timeout can't be starved by an unbounded table scan. The
 * issuance endpoint also opportunistically cleans a small batch on every
 * request as a best-effort backstop between scheduled runs.
 */
async function handle(request: NextRequest) {
    const secret = process.env.DEVICE_CLEANUP_CRON_SECRET;
    if (!secret) {
        return NextResponse.json(
            {
                error: "cron_unconfigured",
                error_description: "DEVICE_CLEANUP_CRON_SECRET not set",
            },
            { status: 500 },
        );
    }

    const presented =
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!constantTimeEquals(presented, secret)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(Number(limitParam) || 500, 2000) : 500;

    try {
        const db = await getDatabase();
        const deleted = await cleanupExpiredDeviceAuthorizations(db, limit);
        return NextResponse.json({ ok: true, deleted, limit });
    } catch (error) {
        console.error("[cleanup-device-codes] error:", error);
        return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
    }
}

function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function POST(request: NextRequest) {
    return handle(request);
}
