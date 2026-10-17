export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { connectionStatus, driveConfigured } from "@/lib/drive";
import { getSession } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/drive/status — is Drive connected for this workspace? */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const status = await connectionStatus(db, session.tenantId);
    return NextResponse.json({ ok: true, configured: await driveConfigured(), ...status });
}
