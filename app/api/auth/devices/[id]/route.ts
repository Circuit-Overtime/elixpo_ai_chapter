export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { revokeTrustedDeviceById } from "@/lib/trusted-devices";

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
 * DELETE /api/auth/devices/[id]
 *
 * Revoke a trusted device. Sets revoked_at; the device's cookie remains
 * valid by signature but the next login check will deny the bypass
 * because the DB row's revoked_at IS NOT NULL. Effectively: 2FA will be
 * required again on that device the next time it tries to sign in.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const db = await getDatabase();
    const ok = await revokeTrustedDeviceById(db, auth.sub, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ revoked: true });
}
