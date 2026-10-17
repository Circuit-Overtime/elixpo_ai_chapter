export const runtime = "edge";

import { parseAttachmentInputs, replaceAttachments } from "@/lib/attachments";
import { cleanupOrphanImages } from "@/lib/cloudinary";
import { getDatabase } from "@/lib/d1-client";
import { getProduct, slugify } from "@/lib/products";
import { getSession } from "@/lib/session";
import { type TemplateRow, createTemplate, toSummary } from "@/lib/templates";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

function sessionUrls(body: any): string[] {
    return Array.isArray(body?.uploadedImages)
        ? body.uploadedImages.filter((u: unknown): u is string => typeof u === "string")
        : [];
}

/** GET /api/templates — list templates across every workspace the user can access. */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const result = await db
        .prepare(
            `SELECT tpl.*, t.name AS workspace_name, t.slug AS workspace_slug,
                    m.role AS workspace_role,
                    CASE WHEN t.id = (
                        SELECT id FROM tenants WHERE owner_uid = ? ORDER BY created_at ASC LIMIT 1
                    ) THEN 1 ELSE 0 END AS workspace_personal
             FROM templates tpl
             JOIN tenants t ON t.id = tpl.tenant_id
             JOIN workspace_members m ON m.tenant_id = tpl.tenant_id
             WHERE m.status = 'active' AND (m.user_uid = ? OR m.email = ?)
             ORDER BY tpl.updated_at DESC`,
        )
        .bind(session.uid, session.uid, session.email.toLowerCase())
        .all();
    type AccessibleTemplate = TemplateRow & {
        workspace_name: string;
        workspace_slug: string | null;
        workspace_personal: number;
        workspace_role: string;
    };
    const rows = (result.results || []) as unknown as AccessibleTemplate[];
    return NextResponse.json({
        ok: true,
        templates: rows.map((row) => ({
            ...toSummary(row),
            workspace: {
                tenantId: row.tenant_id,
                name: row.workspace_name,
                slug: row.workspace_slug,
                role: row.workspace_role,
                kind: row.workspace_personal === 1 ? "personal" : "shared",
                active: row.tenant_id === session.tenantId,
            },
        })),
    });
}

/** POST /api/templates — create a template (one-time by default; product optional). */
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
            { error: "invalid_name", message: "Give the template a name." },
            { status: 400 },
        );
    }
    const slug =
        typeof body?.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);

    const db = await getDatabase();
    // Templates are created as one-time (no product) by default — the user
    // attaches a product later from the Settings page to make it webhook-based.
    // If a productId is supplied up front, validate and use it.
    let productId: string | null = null;
    if (typeof body?.productId === "string" && body.productId) {
        const product = await getProduct(db, session.tenantId, body.productId);
        if (!product) {
            return NextResponse.json(
                { error: "invalid_product", message: "Choose a valid product for this template." },
                { status: 400 },
            );
        }
        productId = product.id;
    }

    try {
        const row = await createTemplate(db, session.tenantId, productId, {
            name,
            slug,
            subject: typeof body?.subject === "string" ? body.subject : "",
            kind: typeof body?.kind === "string" ? body.kind : "custom",
            contentJson: Array.isArray(body?.contentJson) ? body.contentJson : null,
            contentHtml: typeof body?.contentHtml === "string" ? body.contentHtml : "",
            senderId: typeof body?.senderId === "string" ? body.senderId : null,
            bgColor: typeof body?.bgColor === "string" ? body.bgColor : null,
            transactional: body?.transactional === true,
        });
        // Drop any images uploaded this session that didn't make it into the
        // saved content (upload-then-remove).
        await cleanupOrphanImages(db, session.tenantId, {
            previousHtml: "",
            newHtml: row.content_html,
            sessionUrls: sessionUrls(body),
            keepTemplateId: row.id,
        }).catch(() => {});
        if (body?.attachments !== undefined) {
            await replaceAttachments(
                db,
                session.tenantId,
                row.id,
                parseAttachmentInputs(body.attachments),
            );
        }
        const { toPublic } = await import("@/lib/templates");
        return NextResponse.json({ ok: true, template: toPublic(row) }, { status: 201 });
    } catch (e: any) {
        if (String(e?.message || "").includes("UNIQUE")) {
            return NextResponse.json(
                { error: "duplicate", message: "A template with that slug already exists." },
                { status: 409 },
            );
        }
        console.error("[templates] create error:", e);
        return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
}
