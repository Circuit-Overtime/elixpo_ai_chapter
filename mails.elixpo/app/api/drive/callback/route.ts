export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { exchangeCode, saveConnection, verifyState } from "@/lib/drive";
import { appUrl } from "@/lib/env";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/drive/callback — Google redirects here after consent. */
export async function GET(request: NextRequest) {
    const base = await appUrl();
    const settings = (status: string) =>
        NextResponse.redirect(`${base}/dashboard/settings?drive=${status}`);

    const sp = request.nextUrl.searchParams;
    if (sp.get("error")) return settings("denied");

    const code = sp.get("code");
    const tenantId = await verifyState(sp.get("state") || undefined);
    if (!code || !tenantId) return settings("error");

    try {
        const token = await exchangeCode(code);
        const db = await getDatabase();
        await saveConnection(db, tenantId, token);
        return settings("connected");
    } catch {
        return settings("error");
    }
}
