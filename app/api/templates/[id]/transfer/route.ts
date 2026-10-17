export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { createProduct, getProduct, productToPublic } from "@/lib/products";
import { getSession } from "@/lib/session";
import { getTemplate } from "@/lib/templates";
import { getMembership, roleAtLeast } from "@/lib/workspace";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/templates/:id/transfer
 * Moves a template to another writable workspace. Product-backed templates get
 * a destination-owned product credential while webhook endpoint keys remain
 * stable. Historical deliveries and sender credentials intentionally stay put.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    let body: { destinationTenantId?: string; confirmed?: boolean };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const destinationTenantId = body.destinationTenantId?.trim() || "";
    if (!destinationTenantId || destinationTenantId === session.tenantId) {
        return NextResponse.json(
            { error: "invalid_destination", message: "Choose another workspace." },
            { status: 400 },
        );
    }
    if (body.confirmed !== true) {
        return NextResponse.json(
            { error: "confirmation_required", message: "Confirm the transfer first." },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const membership = await getMembership(db, destinationTenantId, session.uid, session.email);
    if (!membership || membership.status !== "active" || !roleAtLeast(membership.role, "writer")) {
        return NextResponse.json(
            {
                error: "destination_forbidden",
                message: "You need writer access or higher in the destination workspace.",
            },
            { status: 403 },
        );
    }

    const { id } = await params;
    const template = await getTemplate(db, session.tenantId, id);
    if (!template) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const destination = (await db
        .prepare("SELECT id, name, slug FROM tenants WHERE id = ? AND status = 'active'")
        .bind(destinationTenantId)
        .first()) as { id: string; name: string; slug: string | null } | null;
    if (!destination) {
        return NextResponse.json({ error: "destination_not_found" }, { status: 404 });
    }

    let destinationProductId: string | null = null;
    let webhookCredentials:
        | { product: ReturnType<typeof productToPublic>; secret: string }
        | undefined;

    try {
        if (template.product_id) {
            const sourceProduct = await getProduct(db, session.tenantId, template.product_id);
            if (!sourceProduct) {
                return NextResponse.json(
                    { error: "product_not_found", message: "The template product is missing." },
                    { status: 409 },
                );
            }
            const created = await createProduct(db, destinationTenantId, sourceProduct.name, null, {
                description: sourceProduct.description,
                homepageUrl: sourceProduct.homepage_url,
                supportEmail: sourceProduct.support_email,
                logoUrl: sourceProduct.logo_url,
                address: sourceProduct.address,
                phone: sourceProduct.phone,
                footerNote: sourceProduct.footer_note,
            });
            destinationProductId = created.product.id;
            webhookCredentials = {
                product: productToPublic(created.product),
                secret: created.secret,
            };
        }

        await db.batch([
            db
                .prepare(
                    `UPDATE templates
                 SET tenant_id = ?, product_id = ?, sender_id = NULL, updated_at = datetime('now')
                 WHERE id = ? AND tenant_id = ?`,
                )
                .bind(destinationTenantId, destinationProductId, id, session.tenantId),
            db
                .prepare(
                    `UPDATE template_attachments SET tenant_id = ?
                 WHERE template_id = ? AND tenant_id = ?`,
                )
                .bind(destinationTenantId, id, session.tenantId),
            db
                .prepare(
                    `UPDATE webhooks
                 SET tenant_id = ?, product_id = ?, updated_at = datetime('now')
                 WHERE template_id = ? AND tenant_id = ?`,
                )
                .bind(destinationTenantId, destinationProductId, id, session.tenantId),
        ]);
    } catch (error) {
        // Avoid leaving an unused destination product if the atomic move fails.
        if (destinationProductId) {
            await db
                .prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?")
                .bind(destinationProductId, destinationTenantId)
                .run()
                .catch(() => {});
        }
        console.error("[templates/transfer] error:", error);
        return NextResponse.json(
            { error: "transfer_failed", message: "Could not transfer the template." },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        templateId: id,
        destination,
        webhookCredentials,
        senderReset: Boolean(template.sender_id || template.product_id),
    });
}
