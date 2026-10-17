export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    cleanupExpiredOrRevokedRefreshTokens,
    redactStaleAuditLogs,
} from "@/lib/db";

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.REFRESH_TOKEN_CLEANUP_CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDatabase();
    const tokensDeleted = await cleanupExpiredOrRevokedRefreshTokens(
        db,
        1000,
        30,
    );
    const logsRedacted = await redactStaleAuditLogs(db, 1000, 90);

    return NextResponse.json({ success: true, tokensDeleted, logsRedacted });
}
