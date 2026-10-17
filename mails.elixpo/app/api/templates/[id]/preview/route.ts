export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getProduct, productToFooter } from "@/lib/products";
import { renderTemplate } from "@/lib/render";
import { getSession } from "@/lib/session";
import { getTemplate } from "@/lib/templates";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/templates/:id/preview — render the template to email HTML.
 * Body may override subject/contentHtml (to preview unsaved editor edits) and
 * supply sample `vars`. Does not send anything.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    let body: any = {};
    try {
        body = await request.json();
    } catch {
        /* optional body */
    }

    const db = await getDatabase();
    const tmpl = await getTemplate(db, session.tenantId, id);
    if (!tmpl) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const subject = typeof body?.subject === "string" ? body.subject : tmpl.subject;
    const contentHtml =
        typeof body?.contentHtml === "string" ? body.contentHtml : tmpl.content_html;
    const bgColor = typeof body?.bgColor === "string" ? body.bgColor : tmpl.bg_color;
    const vars = body?.vars && typeof body.vars === "object" ? body.vars : {};

    const product = tmpl.product_id
        ? await getProduct(db, session.tenantId, tmpl.product_id)
        : null;
    // Product footer when attached, else the template's own footer (one-time).
    let footer = product ? productToFooter(product) : null;
    if (!footer && tmpl.footer_json) {
        try {
            footer = JSON.parse(tmpl.footer_json);
        } catch {
            /* ignore malformed footer */
        }
    }
    const rendered = renderTemplate(
        { subject, content_html: contentHtml, background_color: bgColor },
        vars,
        footer,
    );
    return NextResponse.json({ ok: true, ...rendered });
}
