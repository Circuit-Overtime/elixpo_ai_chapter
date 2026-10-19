export const runtime = "edge";

import { destroyImageByUrl } from "@/lib/cloudinary";
import { getDatabase } from "@/lib/d1-client";
import {
    countProductTemplates,
    deleteProduct,
    getProduct,
    productToPublic,
    updateProduct,
} from "@/lib/products";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/products/:id */
export async function GET(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const db = await getDatabase();
    const product = await getProduct(db, session.tenantId, id);
    if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, product: productToPublic(product) });
}

/** PATCH /api/products/:id — rename, set default sender, or toggle status. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const db = await getDatabase();
    const existing = await getProduct(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const optStr = (v: unknown) =>
        v !== undefined ? (typeof v === "string" ? v : null) : undefined;
    const product = await updateProduct(db, session.tenantId, id, {
        name: typeof body?.name === "string" ? body.name : undefined,
        defaultSenderId:
            body?.defaultSenderId !== undefined
                ? typeof body.defaultSenderId === "string"
                    ? body.defaultSenderId
                    : null
                : undefined,
        status: body?.status === "active" || body?.status === "disabled" ? body.status : undefined,
        description: optStr(body?.description),
        homepageUrl: optStr(body?.homepageUrl),
        supportEmail: optStr(body?.supportEmail),
        logoUrl: optStr(body?.logoUrl),
        address: optStr(body?.address),
        phone: optStr(body?.phone),
        footerNote: optStr(body?.footerNote),
    });

    // If the logo was replaced or removed, free the old asset.
    const newLogo = optStr(body?.logoUrl);
    if (newLogo !== undefined && existing.logo_url && existing.logo_url !== newLogo) {
        await destroyImageByUrl(existing.logo_url).catch(() => {});
    }
    return NextResponse.json({ ok: true, product: product ? productToPublic(product) : null });
}

/** DELETE /api/products/:id — blocked while it still has templates. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getProduct(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const templates = await countProductTemplates(db, session.tenantId, id);
    if (templates > 0) {
        return NextResponse.json(
            {
                error: "has_templates",
                message: `Move or delete this product's ${templates} template${templates > 1 ? "s" : ""} first.`,
            },
            { status: 409 },
        );
    }

    await destroyImageByUrl(existing.logo_url).catch(() => {});
    await deleteProduct(db, session.tenantId, id);
    return NextResponse.json({ ok: true });
}
