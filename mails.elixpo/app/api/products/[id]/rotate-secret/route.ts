export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getProduct, productToPublic, rotateSecret } from "@/lib/products";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/products/:id/rotate-secret — issue a new shared secret (returned
 * once). The previous secret stays valid for a short grace window.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getProduct(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await rotateSecret(db, session.tenantId, id);
    if (!result) return NextResponse.json({ error: "rotate_failed" }, { status: 500 });
    return NextResponse.json({
        ok: true,
        product: productToPublic(result.product),
        secret: result.secret,
    });
}
