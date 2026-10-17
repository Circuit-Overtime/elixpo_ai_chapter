export const runtime = "edge";

import { buildAuthUrl, driveConfigured } from "@/lib/drive";
import { appUrl } from "@/lib/env";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/drive/connect — kick off Google Drive OAuth (redirects to Google). */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    const base = await appUrl();
    if (!(await driveConfigured())) {
        return NextResponse.redirect(`${base}/dashboard/settings?drive=not_configured`);
    }
    const url = await buildAuthUrl(session.tenantId);
    return NextResponse.redirect(url);
}
