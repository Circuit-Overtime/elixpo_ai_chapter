export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { createProduct, listProductsWithCounts, productToPublic } from "@/lib/products";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/products — list the tenant's products (with template/webhook counts). */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const products = await listProductsWithCounts(db, session.tenantId);
    return NextResponse.json({ ok: true, products });
}

/** POST /api/products — create a product; returns the shared secret ONCE. */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
        return NextResponse.json(
            { error: "invalid_name", message: "Give the product a name." },
            { status: 400 },
        );
    }

    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const db = await getDatabase();
    const { product, secret } = await createProduct(
        db,
        session.tenantId,
        name,
        typeof body?.defaultSenderId === "string" ? body.defaultSenderId : null,
        {
            description: str(body?.description),
            homepageUrl: str(body?.homepageUrl),
            supportEmail: str(body?.supportEmail),
            logoUrl: str(body?.logoUrl),
            address: str(body?.address),
            phone: str(body?.phone),
            footerNote: str(body?.footerNote),
        },
    );
    // `secret` is returned exactly once — never retrievable again.
    return NextResponse.json(
        { ok: true, product: productToPublic(product), secret },
        { status: 201 },
    );
}
