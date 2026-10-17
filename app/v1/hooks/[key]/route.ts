export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { deliveryToPublic, findByIdempotencyKey } from "@/lib/deliveries";
import { getProduct, getSigningSecrets } from "@/lib/products";
import { deliverTemplate } from "@/lib/send-pipeline";
import { getTemplate } from "@/lib/templates";
import { SIGNATURE_HEADER, parseSignatureHeader, verifySignature } from "@/lib/webhook-signing";
import { getWebhookByEndpointKey } from "@/lib/webhooks";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: any, status = 200) {
    return NextResponse.json(body, { status });
}

/**
 * POST /v1/hooks/:key — public trigger endpoint, authenticated by HMAC request
 * signing (Stripe-style).
 *
 * Headers:
 *   X-Elixpo-Signature: t=<unix_seconds>,v1=<hex hmac-sha256 of `${t}.${rawBody}`>
 * signed with the parent product's shared secret. Requests outside a 5-minute
 * tolerance, or with a bad signature, are rejected. During a secret rotation
 * the previous secret is accepted until its grace window expires.
 *
 * Body (JSON):
 *   { "to": "user@example.com", "variables": { ... }, "idempotency_key"?: "..." }
 *
 * Renders the webhook's template with the variables, sends it through the
 * resolved sender (template → product default → tenant default), and records a
 * delivery log row for the outcome (success OR failure).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;
    const db = await getDatabase();

    const webhook = await getWebhookByEndpointKey(db, key);
    if (!webhook) return json({ ok: false, error: "unknown_endpoint" }, 404);
    if (webhook.status !== "active") {
        return json({ ok: false, error: "webhook_disabled" }, 403);
    }

    const product = await getProduct(db, webhook.tenant_id, webhook.product_id);
    if (!product) return json({ ok: false, error: "unknown_product" }, 404);
    if (product.status !== "active") {
        return json({ ok: false, error: "product_disabled" }, 403);
    }

    // Recover the signing secret(s). A product created before signed secrets
    // existed has none until it rotates — surface that clearly.
    const { secret, prevSecret, prevValid } = await getSigningSecrets(product);
    if (!secret) {
        return json(
            {
                ok: false,
                error: "no_signing_secret",
                message: "Rotate this product's secret to enable signed requests.",
            },
            403,
        );
    }

    // ── Read the RAW body (signature covers the exact bytes) ──────────────────
    const rawBody = await request.text();

    // ── Verify the signature ──────────────────────────────────────────────────
    const sig = parseSignatureHeader(request.headers.get(SIGNATURE_HEADER));
    if (!sig) {
        return json(
            {
                ok: false,
                error: "missing_signature",
                message: `Sign the request: ${SIGNATURE_HEADER}: t=<unix>,v1=<hmac_sha256 of "t.body">.`,
            },
            401,
        );
    }
    const verdict = await verifySignature(sig, rawBody, { secret, prevSecret, prevValid });
    if (!verdict.ok) {
        const status = verdict.reason === "timestamp_out_of_tolerance" ? 400 : 401;
        return json({ ok: false, error: verdict.reason }, status);
    }

    // ── Parse + validate the payload ──────────────────────────────────────────
    let body: any;
    try {
        body = JSON.parse(rawBody || "{}");
    } catch {
        return json({ ok: false, error: "invalid_json" }, 400);
    }

    const to = typeof body?.to === "string" ? body.to.trim() : "";
    if (!EMAIL_RE.test(to)) {
        return json(
            { ok: false, error: "invalid_recipient", message: "Provide a valid `to` email." },
            400,
        );
    }
    const vars =
        body?.variables && typeof body.variables === "object"
            ? body.variables
            : body?.vars && typeof body.vars === "object"
              ? body.vars
              : {};
    const idempotencyKey =
        typeof body?.idempotency_key === "string"
            ? body.idempotency_key
            : request.headers.get("idempotency-key") || null;

    // ── Idempotency: replay a prior result instead of double-sending ──────────
    if (idempotencyKey) {
        const prior = await findByIdempotencyKey(db, webhook.tenant_id, idempotencyKey);
        if (prior) {
            return json({
                ok: prior.status === "sent",
                deduped: true,
                id: prior.id,
                status: prior.status,
                delivery: deliveryToPublic(prior),
            });
        }
    }

    const template = await getTemplate(db, webhook.tenant_id, webhook.template_id);
    if (!template) return json({ ok: false, error: "template_missing" }, 500);

    const result = await deliverTemplate(db, {
        tenantId: webhook.tenant_id,
        template,
        product,
        webhookId: webhook.id,
        to,
        vars,
        idempotencyKey,
    });

    const payload = {
        ok: result.ok,
        id: result.deliveryId,
        status: result.status,
        to,
        subject: result.subject,
        ...(result.ok ? {} : { error: result.error }),
    };
    // 200 when accepted by SMTP, or skipped because the recipient unsubscribed
    // (a successful no-op, not an error). 202 when the first attempt hit a
    // transient error and the send was handed to the retry queue — the final
    // outcome resolves in the delivery log. 502 only on a real downstream failure.
    const status =
        result.status === "queued" ? 202 : result.ok || result.status === "suppressed" ? 200 : 502;
    return json(payload, status);
}
