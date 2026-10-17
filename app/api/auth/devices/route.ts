export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { listTrustedDevices } from "@/lib/trusted-devices";

async function getAuth(request: NextRequest) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJWT(token);
    if (payload?.type !== "access") return null;
    return payload;
}

/**
 * GET /api/auth/devices
 *
 * List every device the user has marked trusted during a 2FA challenge.
 * Hashed IPs and short UA summaries are returned (raw IP/UA never leave
 * the server). revoked devices are still returned so the user can see
 * the audit trail; `is_active` flags them visually.
 */
export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const rows = await listTrustedDevices(db, auth.sub);
    const devices = rows.map((r) => ({
        id: r.id,
        device_uuid: r.device_uuid,
        name: r.name,
        ua_short: r.ua_short,
        last_seen_at: r.last_seen_at,
        created_at: r.created_at,
        revoked_at: r.revoked_at,
        is_active: !r.revoked_at,
    }));
    return NextResponse.json({ devices });
}
