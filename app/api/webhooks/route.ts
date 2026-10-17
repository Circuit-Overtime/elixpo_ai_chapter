export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getSession } from "@/lib/session";
import {
    createWebhook,
    listWebhooks,
    listWebhooksByProduct,
    listWebhooksByTemplate,
    webhookToPublic,
} from "@/lib/webhooks";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/webhooks — list the tenant's webhooks (joined with template/product
 * names). Optionally filter to one template with ?templateId=.
 */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const sp = request.nextUrl.searchParams;
    const templateId = sp.get("templateId");
    const productId = sp.get("productId");
    if (templateId) {
        const rows = await listWebhooksByTemplate(db, session.tenantId, templateId);
        return NextResponse.json({ ok: true, webhooks: rows.map(webhookToPublic) });
    }
    if (productId) {
        const webhooks = await listWebhooksByProduct(db, session.tenantId, productId);
        return NextResponse.json({ ok: true, webhooks });
    }
    const webhooks = await listWebhooks(db, session.tenantId);
    return NextResponse.json({ ok: true, webhooks });
}

/** POST /api/webhooks — create a webhook event on a template. Body: { templateId, name }. */
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

    const templateId = typeof body?.templateId === "string" ? body.templateId : "";
    if (!templateId) {
        return NextResponse.json(
            { error: "invalid_template", message: "Choose a template for this webhook." },
            { status: 400 },
        );
    }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
        return NextResponse.json(
            { error: "invalid_name", message: "Give the webhook event a name (e.g. order.paid)." },
            { status: 400 },
        );
    }

    const productId = typeof body?.productId === "string" ? body.productId : undefined;
    const db = await getDatabase();
    const row = await createWebhook(db, session.tenantId, templateId, name, productId);
    if (!row) {
        return NextResponse.json(
            { error: "invalid_target", message: "That template or product doesn't exist." },
            { status: 400 },
        );
    }
    return NextResponse.json({ ok: true, webhook: webhookToPublic(row) }, { status: 201 });
}
