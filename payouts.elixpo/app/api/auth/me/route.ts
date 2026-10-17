export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getSession } from "@/lib/session";

/** GET /api/auth/me — current dashboard session + merchant. */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let merchantName = session.email;
    try {
        const db = await getDatabase();
        const m = (await db
            .prepare("SELECT name FROM merchants WHERE id = ?")
            .bind(session.merchantId)
            .first()) as { name: string } | null;
        if (m?.name) merchantName = m.name;
    } catch {
        // best-effort
    }

    return NextResponse.json({
        uid: session.uid,
        email: session.email,
        name: session.name || session.email,
        avatar: session.avatar ?? null,
        merchant: { id: session.merchantId, name: merchantName },
    });
}
