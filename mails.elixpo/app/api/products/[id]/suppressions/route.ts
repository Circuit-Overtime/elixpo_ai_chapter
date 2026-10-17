export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getProduct } from "@/lib/products";
import { getSession } from "@/lib/session";
import { listSuppressions, suppress, suppressionToPublic, unsuppress } from "@/lib/suppressions";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Ctx = { params: Promise<{ id: string }> };

async function ownedProduct(request: NextRequest, id: string) {
    const session = await getSession(request);
    if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    const db = await getDatabase();
    const product = await getProduct(db, session.tenantId, id);
    if (!product) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
    return { db, product, session };
}

/** GET /api/products/:id/suppressions — the product's unsubscribe list. */
export async function GET(request: NextRequest, { params }: Ctx) {
    const { id } = await params;
    const ctx = await ownedProduct(request, id);
    if (ctx.error) return ctx.error;
    const rows = await listSuppressions(ctx.db, id);
    return NextResponse.json({ ok: true, suppressions: rows.map(suppressionToPublic) });
}

/** POST /api/products/:id/suppressions — manually suppress an address. Body: { email }. */
export async function POST(request: NextRequest, { params }: Ctx) {
    const { id } = await params;
    const ctx = await ownedProduct(request, id);
    if (ctx.error) return ctx.error;

    const denied = await requireWriteRole(ctx.session);
    if (denied) return denied;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!EMAIL_RE.test(email)) {
        return NextResponse.json(
            { error: "invalid_email", message: "Enter a valid email." },
            { status: 400 },
        );
    }
    await suppress(ctx.db, id, email, "manual");
    return NextResponse.json({ ok: true });
}

/** DELETE /api/products/:id/suppressions?email=... — re-subscribe an address. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const { id } = await params;
    const ctx = await ownedProduct(request, id);
    if (ctx.error) return ctx.error;

    const denied = await requireWriteRole(ctx.session);
    if (denied) return denied;
    const email = request.nextUrl.searchParams.get("email");
    if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
    await unsuppress(ctx.db, id, email);
    return NextResponse.json({ ok: true });
}
