export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { listUserOAuthClients } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

export async function GET(request: NextRequest) {
    const token = request.cookies.get("access_token")?.value;
    if (!token)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyJWT(token);
    if (!payload)
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    try {
        const db = await getDatabase();
        const result = await listUserOAuthClients(db, payload.sub);
        const apps = (result.results || []) as any[];
        return NextResponse.json({ apps });
    } catch (err) {
        console.error("[oauth-apps]", err);
        return NextResponse.json(
            { error: "Failed to fetch apps" },
            { status: 500 },
        );
    }
}
