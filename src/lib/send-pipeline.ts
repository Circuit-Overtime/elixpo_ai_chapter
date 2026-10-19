/**
 * Send pipeline — the keystone that turns a (template, variables, recipient)
 * into a real email and a delivery-log row. Used by the public trigger
 * endpoint (app/v1/hooks/[key]). Sender resolution follows the agreed chain:
 *
 *     template.sender_id  →  product.default_sender_id  →  tenant default sender
 *
 * Every attempt — success or failure — is recorded in `deliveries`.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { listAttachments, resolveAttachments } from "./attachments";
import {
    createDelivery,
    getDelivery,
    incrementAttempts,
    markDeliveryFailed,
    markDeliveryQueued,
    markDeliverySent,
} from "./deliveries";
import { decryptSecret } from "./encryption";
import { appUrl } from "./env";
import { type ProductRow, getProduct, productToFooter } from "./products";
import { enqueueRetry } from "./queue";
import { type EmailFooter, renderTemplate } from "./render";
import { type SenderRow, getSender } from "./senders";
import { relayViaSender } from "./smtp-sender";
import { isSuppressed, signUnsub } from "./suppressions";
import { type TemplateRow, getTemplate } from "./templates";

/**
 * Resolve which sender a template sends through:
 *   1. the template's explicit sender override, else
 *   2. the product's default sender, else
 *   3. the tenant's default sender (is_default = 1).
 */
/** Per-template footer (one-time templates store their own footer JSON). */
function parseTemplateFooter(t: TemplateRow): EmailFooter | null {
    if (!t.footer_json) return null;
    try {
        return JSON.parse(t.footer_json) as EmailFooter;
    } catch {
        return null;
    }
}

export async function resolveSender(
    db: D1Database,
    tenantId: string,
    template: TemplateRow,
    product: ProductRow | null,
): Promise<SenderRow | null> {
    if (template.sender_id) {
        const s = await getSender(db, tenantId, template.sender_id);
        if (s) return s;
    }
    if (product?.default_sender_id) {
        const s = await getSender(db, tenantId, product.default_sender_id);
        if (s) return s;
    }
    return (await db
        .prepare("SELECT * FROM senders WHERE tenant_id = ? AND is_default = 1 LIMIT 1")
        .bind(tenantId)
        .first()) as SenderRow | null;
}

export interface DeliverInput {
    tenantId: string;
    template: TemplateRow;
    product: ProductRow | null;
    webhookId?: string | null;
    to: string;
    vars?: Record<string, any>;
    /** Optional From override (e.g. an alias). Defaults to the sender identity. */
    fromEmail?: string | null;
    fromName?: string | null;
    idempotencyKey?: string | null;
}

export interface DeliverResult {
    ok: boolean;
    deliveryId: string;
    status: "sent" | "failed" | "suppressed" | "queued";
    subject: string;
    error?: string;
    smtpResponse?: string | null;
}

/** Pure send attempt: render → resolve → relay. Writes NO status to the row —
 * the caller decides whether the outcome means sent / queued-for-retry /
 * failed, so the same core serves both the first attempt and a retry. */
interface AttemptResult {
    ok: boolean;
    /** Only meaningful when !ok — is this worth retrying, or a hard failure? */
    retryable: boolean;
    subject: string;
    error?: string;
    smtpResponse?: string | null;
}

interface AttemptInput {
    tenantId: string;
    template: TemplateRow;
    product: ProductRow | null;
    to: string;
    vars: Record<string, any>;
    fromEmail?: string | null;
    fromName?: string | null;
}

/**
 * Decide whether a relay failure is worth retrying. Hard SMTP rejections (5yz),
 * auth failures and bad-recipient bounces won't fix themselves on a blind
 * retry; timeouts, connection drops and 4yz greylisting will.
 */
function classifyFailure(error?: string, response?: string | null): "transient" | "permanent" {
    const blob = `${error || ""} ${response || ""}`.toLowerCase();
    if (/\b5\d\d\b/.test(blob)) return "permanent";
    if (
        /(auth|535|credential|password|username)/.test(blob) &&
        /(fail|invalid|reject|denied)/.test(blob)
    )
        return "permanent";
    if (
        /(no such user|user unknown|mailbox unavailable|does not exist|invalid recipient|address rejected)/.test(
            blob,
        )
    )
        return "permanent";
    return "transient";
}

async function executeSend(
    db: D1Database,
    deliveryId: string,
    input: AttemptInput,
): Promise<AttemptResult> {
    const { tenantId, template, product, to, vars } = input;
    const productId = product?.id ?? template.product_id;
    const isTransactional = template.transactional === 1;

    // Per-recipient one-click unsubscribe link (non-transactional only). The
    // unsubscribe + suppression list are product-scoped, so one-time templates
    // (no product) carry no unsubscribe link.
    const unsubscribeUrl =
        isTransactional || !productId
            ? null
            : `${await appUrl()}/u/${await signUnsub(productId, to)}`;

    const sender = await resolveSender(db, tenantId, template, product);
    // Footer: the product's brand footer when attached, else the template's own
    // per-template footer (one-time templates).
    const footer = product ? productToFooter(product) : parseTemplateFooter(template);
    if (footer && unsubscribeUrl) footer.unsubscribeUrl = unsubscribeUrl;
    const rendered = renderTemplate(
        {
            subject: template.subject,
            content_html: template.content_html,
            background_color: template.bg_color,
        },
        { ...vars, unsubscribe_url: unsubscribeUrl || "" },
        footer,
    );
    const subject = rendered.subject || "(no subject)";

    if (!sender) {
        return {
            ok: false,
            retryable: false,
            subject,
            error: "No sender available — set a default sender on the product or tenant.",
        };
    }
    if (sender.status && sender.status !== "active") {
        return {
            ok: false,
            retryable: false,
            subject,
            error: `Sender ${sender.email} is ${sender.status}.`,
        };
    }

    let pass: string;
    try {
        pass = await decryptSecret(sender.app_password_enc);
    } catch {
        return {
            ok: false,
            retryable: false,
            subject,
            error: "Could not decrypt the sender's app password.",
        };
    }

    // Resolve attachments (substitute vars, download from Drive/URL, base64).
    let attachments: Array<{ filename: string; contentType: string; contentBase64: string }> = [];
    try {
        const rows = await listAttachments(db, tenantId, template.id);
        if (rows.length) attachments = await resolveAttachments(db, tenantId, rows, vars);
    } catch {
        attachments = [];
    }

    const result = await relayViaSender({
        host: sender.smtp_host,
        port: sender.smtp_port,
        secure: sender.smtp_secure,
        user: sender.username || sender.email,
        pass,
        from: input.fromEmail || sender.email,
        fromName: input.fromName ?? sender.display_name,
        to,
        subject,
        html: rendered.html,
        text: rendered.text,
        attachments,
        listUnsubscribe: unsubscribeUrl,
    });

    if (result.ok)
        return { ok: true, retryable: false, subject, smtpResponse: result.response ?? null };

    const error = result.error || "Send failed.";
    const retryable = classifyFailure(error, result.response) === "transient";
    return { ok: false, retryable, subject, error, smtpResponse: result.response ?? null };
}

/**
 * Render the template, relay it through the resolved sender, and log the
 * outcome. Always returns a DeliverResult (never throws for send failures).
 *
 * The first attempt runs inline. A *transient* relay failure is parked as
 * `queued` and a retry job is enqueued (see src/lib/queue + the consumer Worker
 * in workers/smtp-sender); permanent failures fail fast. If no queue binding is
 * available (local dev) a transient failure degrades to `failed`.
 */
export async function deliverTemplate(db: D1Database, input: DeliverInput): Promise<DeliverResult> {
    const { tenantId, template, product, webhookId, to, vars = {} } = input;
    const productId = product?.id ?? template.product_id;
    const isTransactional = template.transactional === 1;

    // Honor unsubscribes — except for transactional templates (receipts etc.),
    // which are CAN-SPAM exempt and always send. Suppression is product-scoped,
    // so one-time templates (no product) have nothing to check against.
    if (!isTransactional && productId && (await isSuppressed(db, productId, to))) {
        const deliveryId = await createDelivery(db, {
            tenantId,
            productId,
            templateId: template.id,
            webhookId: webhookId || null,
            senderId: null,
            toEmail: to,
            subject: template.subject,
            vars,
            idempotencyKey: input.idempotencyKey || null,
            status: "suppressed",
        });
        return {
            ok: false,
            deliveryId,
            status: "suppressed",
            subject: template.subject,
            error: "Recipient is unsubscribed.",
        };
    }

    const sender = await resolveSender(db, tenantId, template, product);

    // Open the delivery row up front so even a pre-send failure is auditable.
    const deliveryId = await createDelivery(db, {
        tenantId,
        productId,
        templateId: template.id,
        webhookId: webhookId || null,
        senderId: sender?.id ?? null,
        toEmail: to,
        subject: template.subject,
        vars,
        idempotencyKey: input.idempotencyKey || null,
    });

    const r = await executeSend(db, deliveryId, {
        tenantId,
        template,
        product,
        to,
        vars,
        fromEmail: input.fromEmail,
        fromName: input.fromName,
    });

    if (r.ok) {
        await markDeliverySent(db, deliveryId, r.smtpResponse ?? null);
        return {
            ok: true,
            deliveryId,
            status: "sent",
            subject: r.subject,
            smtpResponse: r.smtpResponse ?? null,
        };
    }

    // Transient failure → hand off to the retry queue and report 202/queued.
    if (r.retryable && (await enqueueRetry({ deliveryId }))) {
        await markDeliveryQueued(db, deliveryId, r.error ?? null);
        return { ok: true, deliveryId, status: "queued", subject: r.subject, error: r.error };
    }

    const error = r.error || "Send failed.";
    await markDeliveryFailed(db, deliveryId, error, r.smtpResponse ?? null);
    return {
        ok: false,
        deliveryId,
        status: "failed",
        subject: r.subject,
        error,
        smtpResponse: r.smtpResponse ?? null,
    };
}

export interface RedeliverResult {
    ok: boolean;
    status: "sent" | "failed" | "queued";
    /** True when the consumer should retry (CF Queue backoff), false to ack. */
    retryable: boolean;
    error?: string;
}

/**
 * Re-attempt a previously-queued delivery, rebuilding everything from its row.
 * Called by the consumer Worker (workers/smtp-sender) via /v1/internal/redeliver.
 * One attempt, and it reports the outcome — the *orchestrator* decides what to
 * do next (the send queue retries on `retryable`; the retry queue escalates to
 * the durable Workflow; the Workflow sleeps and re-attempts):
 *   sent      → row marked sent.
 *   permanent → row marked failed.
 *   transient → row left `queued`, retryable=true.
 *
 * `final: true` is the Workflow's terminal give-up: no attempt is made, the row
 * is marked permanently failed because even long-horizon retries are exhausted.
 */
export async function redeliverById(
    db: D1Database,
    deliveryId: string,
    opts: { final?: boolean } = {},
): Promise<RedeliverResult> {
    const row = await getDelivery(db, deliveryId);
    if (!row) return { ok: false, status: "failed", retryable: false, error: "delivery_not_found" };
    if (row.status === "sent") return { ok: true, status: "sent", retryable: false };

    if (opts.final) {
        await markDeliveryFailed(
            db,
            deliveryId,
            row.error || "Retries exhausted after extended backoff.",
            row.smtp_response ?? null,
        );
        return { ok: false, status: "failed", retryable: false, error: "retries_exhausted" };
    }

    const template = row.template_id ? await getTemplate(db, row.tenant_id, row.template_id) : null;
    if (!template) {
        await markDeliveryFailed(db, deliveryId, "Template no longer exists.");
        return { ok: false, status: "failed", retryable: false, error: "template_missing" };
    }
    const product = row.product_id ? await getProduct(db, row.tenant_id, row.product_id) : null;

    await incrementAttempts(db, deliveryId);
    let vars: Record<string, any> = {};
    try {
        vars = row.vars_json ? JSON.parse(row.vars_json) : {};
    } catch {
        vars = {};
    }

    const r = await executeSend(db, deliveryId, {
        tenantId: row.tenant_id,
        template,
        product,
        to: row.to_email,
        vars,
    });

    if (r.ok) {
        await markDeliverySent(db, deliveryId, r.smtpResponse ?? null);
        return { ok: true, status: "sent", retryable: false };
    }
    // Transient → keep the row queued and report retryable so the orchestrator
    // (queue backoff, or the durable Workflow) attempts again later.
    if (r.retryable) {
        await markDeliveryQueued(db, deliveryId, r.error ?? null);
        return { ok: false, status: "queued", retryable: true, error: r.error };
    }
    await markDeliveryFailed(db, deliveryId, r.error || "Send failed.", r.smtpResponse ?? null);
    return { ok: false, status: "failed", retryable: false, error: r.error };
}
