/**
 * Outbound webhook delivery (Elixpo Pay -> consuming app).
 *
 * ── Contract (consumer must verify) ─────────────────────────────────────────
 * POST <endpoint.url>
 *   Content-Type: application/json
 *   X-Elixpo-Pay-Event:     <event type, e.g. entitlement.updated>
 *   X-Elixpo-Pay-Timestamp: <unix seconds>
 *   X-Elixpo-Pay-Signature: sha256=<hex>[,sha256=<hex>…]
 * Body: { id, type, created, data }
 *
 * The consumer recomputes HMAC_SHA256(secret, `${timestamp}.${rawBody}`) with
 * its per-app signing secret (`whsec_…`, shown in the merchant dashboard) and
 * rejects on mismatch or stale ts. During a secret-rotation grace window the
 * header carries MULTIPLE comma-separated signatures (current + previous) — the
 * consumer accepts if ANY matches, so a redeploy can lag the rotation. Older
 * endpoints without a stored signing_secret fall back to `secret_ref`.
 *
 * Each endpoint subscribes to a SUBSET of event types (the `events` column).
 * We only deliver an event the endpoint is subscribed to — so a merchant can
 * receive just the fulfillment event, or also opt into payment notifications.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { hmacSha256Hex } from "./crypto";
import type { EntitlementView } from "./entitlements";
import { getEnv } from "./env";
import { newId } from "./ids";

/**
 * The events Elixpo Pay can emit. Surfaced in the dashboard so merchants pick
 * which to receive. Keep in sync with the docs (app/docs/webhooks).
 */
export const WEBHOOK_EVENT_TYPES = [
    {
        type: "entitlement.updated",
        label: "Entitlement updated",
        description:
            "A buyer's access was granted, changed, or expired. Required to fulfill purchases.",
        required: true,
    },
    {
        type: "payment.captured",
        label: "Payment captured",
        description:
            "A payment succeeded. Useful for receipts, analytics, or your own ledger.",
        required: false,
    },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]["type"];

const KNOWN_EVENTS = new Set(WEBHOOK_EVENT_TYPES.map((e) => e.type));
const REQUIRED_EVENTS = WEBHOOK_EVENT_TYPES.filter((e) => e.required).map(
    (e) => e.type,
);

/** Parse the stored `events` JSON, falling back to the required set. */
export function parseEvents(raw: string | null | undefined): string[] {
    if (!raw) return [...REQUIRED_EVENTS];
    try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.filter((e) => typeof e === "string");
    } catch {
        // ignore
    }
    return [...REQUIRED_EVENTS];
}

/** Sanitise a requested subscription: keep known events, always keep required. */
export function normaliseEvents(requested: unknown): string[] {
    const set = new Set<string>(REQUIRED_EVENTS);
    if (Array.isArray(requested)) {
        for (const e of requested) {
            if (
                typeof e === "string" &&
                KNOWN_EVENTS.has(e as WebhookEventType)
            ) {
                set.add(e);
            }
        }
    }
    return [...set];
}

export interface WebhookEndpointRow {
    id: string;
    app_id: string;
    url: string;
    secret_ref: string;
    signing_secret?: string | null;
    prev_signing_secret?: string | null;
    prev_signing_secret_expires_at?: string | null;
    events: string;
}

/**
 * Resolve the HMAC secret(s) to sign with. The first is the current secret;
 * during a rotation grace window the previous secret is also returned so the
 * consumer can verify with whichever it still has configured (dual-sign). Falls
 * back to the env var named by `secret_ref` for legacy endpoints.
 */
async function endpointSecrets(
    endpoint: WebhookEndpointRow,
): Promise<string[]> {
    const out: string[] = [];
    if (endpoint.signing_secret) out.push(endpoint.signing_secret);
    else if (endpoint.secret_ref) {
        const env = await getEnv(endpoint.secret_ref);
        if (env) out.push(env);
    }
    if (
        endpoint.prev_signing_secret &&
        endpoint.prev_signing_secret_expires_at &&
        new Date(
            `${endpoint.prev_signing_secret_expires_at.replace(" ", "T")}Z`,
        ) > new Date()
    ) {
        out.push(endpoint.prev_signing_secret);
    }
    return out;
}

/**
 * Sign and deliver one event to an endpoint, recording the attempt. No-op if
 * the endpoint isn't subscribed to `eventType`.
 */
export async function fireWebhook(
    db: D1Database,
    endpoint: WebhookEndpointRow,
    eventType: WebhookEventType,
    data: unknown,
): Promise<void> {
    if (!parseEvents(endpoint.events).includes(eventType)) {
        return; // not subscribed — skip silently
    }

    const secrets = await endpointSecrets(endpoint);
    if (secrets.length === 0) {
        console.error(
            `[webhook] no signing secret for endpoint ${endpoint.id} (app ${endpoint.app_id})`,
        );
        return;
    }

    const payload = {
        id: newId("webhookDelivery"),
        type: eventType,
        created: Math.floor(Date.now() / 1000),
        data,
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    // Sign with every valid secret (current + any in-grace previous). The header
    // is a comma-separated list of `sha256=…`; the consumer accepts if ANY match.
    const signature = (
        await Promise.all(
            secrets.map(
                async (s) =>
                    `sha256=${await hmacSha256Hex(s, `${timestamp}.${rawBody}`)}`,
            ),
        )
    ).join(",");

    const deliveryId = payload.id;
    await db
        .prepare(
            `INSERT INTO webhook_deliveries (id, endpoint_id, app_id, event_type, payload, status, attempts)
             VALUES (?, ?, ?, ?, ?, 'pending', 1)`,
        )
        .bind(deliveryId, endpoint.id, endpoint.app_id, eventType, rawBody)
        .run();

    try {
        const res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Elixpo-Pay-Event": eventType,
                "X-Elixpo-Pay-Timestamp": timestamp,
                "X-Elixpo-Pay-Signature": signature,
            },
            body: rawBody,
        });
        const respBody = (await res.text().catch(() => "")).slice(0, 1000);
        await db
            .prepare(
                `UPDATE webhook_deliveries
                 SET status = ?, response_status = ?, response_body = ?, last_attempt_at = datetime('now')
                 WHERE id = ?`,
            )
            .bind(
                res.ok ? "delivered" : "failed",
                res.status,
                respBody,
                deliveryId,
            )
            .run();
    } catch (err: any) {
        await db
            .prepare(
                `UPDATE webhook_deliveries
                 SET status = 'failed', response_body = ?, last_attempt_at = datetime('now')
                 WHERE id = ?`,
            )
            .bind(String(err?.message || err).slice(0, 1000), deliveryId)
            .run();
    }
}

/** Deliver the fulfillment event (access granted/changed/expired). */
export async function fireEntitlementUpdated(
    db: D1Database,
    endpoint: WebhookEndpointRow,
    data: EntitlementView,
): Promise<void> {
    await fireWebhook(db, endpoint, "entitlement.updated", data);
}

export interface PaymentCapturedData {
    app: string;
    uid: string;
    transaction_id: string;
    provider_payment_id: string | null;
    provider_order_id: string | null;
    currency: string;
    amount: number;
    tier: string;
}

/** Deliver the optional payment-captured notification. */
export async function firePaymentCaptured(
    db: D1Database,
    endpoint: WebhookEndpointRow,
    data: PaymentCapturedData,
): Promise<void> {
    await fireWebhook(db, endpoint, "payment.captured", data);
}
