export const runtime = "edge";

import {
    attachmentToPublic,
    deleteAllForTemplate,
    listAttachments,
    parseAttachmentInputs,
    replaceAttachments,
} from "@/lib/attachments";
import { cleanupOrphanImages } from "@/lib/cloudinary";
import { getDatabase } from "@/lib/d1-client";
import { getProduct, productToFooter, slugify } from "@/lib/products";
import { getSession } from "@/lib/session";
import { deleteTemplate, getTemplate, toPublic, updateTemplate } from "@/lib/templates";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/templates/:id — full template (editor doc included). */
export async function GET(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const db = await getDatabase();
    const row = await getTemplate(db, session.tenantId, id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const attachments = await listAttachments(db, session.tenantId, id);
    const product = row.product_id ? await getProduct(db, session.tenantId, row.product_id) : null;
    return NextResponse.json({
        ok: true,
        template: {
            ...toPublic(row),
            attachments: attachments.map(attachmentToPublic),
            // Webhook templates inherit the product footer; one-time templates
            // keep their own footer from toPublic (parsed from footer_json).
            ...(product ? { footer: productToFooter(product) } : {}),
        },
    });
}

/** PATCH /api/templates/:id — update content/metadata. */
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
    const existing = await getTemplate(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Resolve the product change: a non-empty string attaches that product
    // (webhook template) — validate it belongs to the tenant; null/"" detaches
    // it (one-time template). undefined leaves it unchanged.
    let productId: string | null | undefined;
    if (body?.productId !== undefined) {
        if (typeof body.productId === "string" && body.productId) {
            const product = await getProduct(db, session.tenantId, body.productId);
            if (!product) {
                return NextResponse.json(
                    { error: "invalid_product", message: "Choose a valid product." },
                    { status: 400 },
                );
            }
            productId = product.id;
        } else {
            productId = null;
        }
    }

    try {
        const row = await updateTemplate(db, session.tenantId, id, {
            productId,
            footer:
                body?.footer !== undefined
                    ? body.footer && typeof body.footer === "object"
                        ? body.footer
                        : null
                    : undefined,
            name: typeof body?.name === "string" ? body.name.trim() : undefined,
            slug:
                typeof body?.slug === "string" && body.slug.trim() ? slugify(body.slug) : undefined,
            subject: typeof body?.subject === "string" ? body.subject : undefined,
            kind: typeof body?.kind === "string" ? body.kind : undefined,
            contentJson:
                body?.contentJson !== undefined
                    ? Array.isArray(body.contentJson)
                        ? body.contentJson
                        : null
                    : undefined,
            contentHtml: typeof body?.contentHtml === "string" ? body.contentHtml : undefined,
            senderId:
                body?.senderId !== undefined
                    ? typeof body.senderId === "string"
                        ? body.senderId
                        : null
                    : undefined,
            bgColor:
                body?.bgColor !== undefined
                    ? typeof body.bgColor === "string"
                        ? body.bgColor
                        : null
                    : undefined,
            transactional:
                typeof body?.transactional === "boolean" ? body.transactional : undefined,
            status:
                body?.status === "active" || body?.status === "archived" ? body.status : undefined,
        });
        // When the body changed, delete images that are no longer referenced
        // (removed or replaced) plus any uploaded-then-removed this session.
        if (typeof body?.contentHtml === "string") {
            const uploaded = Array.isArray(body?.uploadedImages)
                ? body.uploadedImages.filter((u: unknown): u is string => typeof u === "string")
                : [];
            await cleanupOrphanImages(db, session.tenantId, {
                previousHtml: existing.content_html,
                newHtml: body.contentHtml,
                sessionUrls: uploaded,
                keepTemplateId: id,
            }).catch(() => {});
        }
        if (body?.attachments !== undefined) {
            await replaceAttachments(
                db,
                session.tenantId,
                id,
                parseAttachmentInputs(body.attachments),
            );
        }
        return NextResponse.json({ ok: true, template: row ? toPublic(row) : null });
    } catch (e: any) {
        if (String(e?.message || "").includes("UNIQUE")) {
            return NextResponse.json(
                { error: "duplicate", message: "A template with that slug already exists." },
                { status: 409 },
            );
        }
        console.error("[templates] update error:", e);
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
}

/** DELETE /api/templates/:id */
export async function DELETE(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;
    const { id } = await params;

    const db = await getDatabase();
    const existing = await getTemplate(db, session.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Free this template's images (those no other template references).
    await cleanupOrphanImages(db, session.tenantId, {
        previousHtml: existing.content_html,
        newHtml: "",
        keepTemplateId: id,
    }).catch(() => {});
    await deleteAllForTemplate(db, session.tenantId, id);
    await deleteTemplate(db, session.tenantId, id);
    return NextResponse.json({ ok: true });
}
