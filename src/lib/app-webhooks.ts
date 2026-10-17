/**
 * App-scoped webhook dispatch.
 *
 * Each OAuth app registers a webhook_url + set of subscribed event types at
 * registration time. The SSO mints a per-app secret, hashes it, and returns
 * the plaintext to the developer once.
 *
 * When an event fires (user.deleted, user.updated, ...), the dispatcher
 * finds every active OAuth app the user has authorized whose webhook_events
 * includes this event type, and POSTs a signed payload to each app.
 *
 * Signature format mirrors the ElixpoURL receiver and the public docs:
 *   X-Elixpo-Event-Id:  <uuid>
 *   X-Elixpo-Event:     user.deleted
 *   X-Elixpo-Timestamp: <unix-seconds>
 *   X-Elixpo-Signature: sha256=<hex>
 *
 *   hmac = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 *
 * Receivers reject signatures that don't match or timestamps that are
 * outside a ±5 minute window.
 */

import { getDatabase } from "./d1-client";

export type AppWebhookEvent =
    | "user.deleted"
    | "user.updated"
    | "app.revoked"
    | "app.authorized";

export const VALID_EVENTS: readonly AppWebhookEvent[] = [
    "user.deleted",
    "user.updated",
    "app.revoked",
    "app.authorized",
];

// ── Secret management ────────────────────────────────────────────────────

/**
 * Mint a fresh webhook secret. Returns { plaintext, hash }. Caller stores
 * `hash` in oauth_clients.webhook_secret_hash and returns `plaintext`
 * to the developer exactly once.
 */
export async function mintWebhookSecret(): Promise<{
    plaintext: string;
    hash: string;
}> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const plaintext = `whk_${bytesToHex(bytes)}`;
    const hash = await sha256Hex(plaintext);
    return { plaintext, hash };
}

async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input),
    );
    return bytesToHex(new Uint8Array(buf));
}

function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

// ── Dispatcher ───────────────────────────────────────────────────────────

interface AppWebhookTarget {
    endpointId: string;
    clientId: string;
    url: string;
    secretPlaintext: string;
    events: AppWebhookEvent[];
}

/**
 * Fire an app-scoped event to every webhook endpoint registered for an
 * app the user has authorized that is:
 *   1. On a client_id in `authorizedClientIds`
 *   2. Active (oauth_clients.is_active = 1 AND endpoint.is_active = 1)
 *   3. Subscribed to `event` (event ∈ endpoint.events)
 *
 * `authorizedClientIds` should come from the calling site (e.g. the
 * delete-account route already collects this from refresh_tokens).
 *
 * Fan-out: one POST per endpoint. An app with 3 endpoints subscribed to
 * `user.deleted` receives 3 deliveries on that event.
 *
 * NOTE on secrets: the DB only stores the hash; signing needs the
 * plaintext. The caller passes a `getSecretPlaintext(endpointId)` resolver
 * — typically a KV lookup populated at registration/rotation time. If the
 * resolver returns null, that single delivery is skipped (logged). Other
 * endpoints on the same app still attempt independently.
 */
export async function dispatchAppEvent(
    event: AppWebhookEvent,
    payload: Record<string, unknown>,
    authorizedClientIds: string[],
    getSecretPlaintext: (
        endpointId: string,
        secretHash: string,
    ) => Promise<string | null>,
): Promise<{
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
}> {
    if (authorizedClientIds.length === 0) {
        return { attempted: 0, delivered: 0, failed: 0, skipped: 0 };
    }

    const db = await getDatabase();

    // JOIN keeps a deleted/disabled app from leaking deliveries even if
    // an endpoint row is somehow stale — the cascade FK should already
    // prevent this, but this is the read-side belt to the write-side
    // suspenders.
    const placeholders = authorizedClientIds.map(() => "?").join(",");
    const result = await db
        .prepare(
            `SELECT e.id, e.client_id, e.url, e.secret_hash, e.events
            FROM oauth_client_webhook_endpoints e
            JOIN oauth_clients c ON c.client_id = e.client_id
            WHERE e.client_id IN (${placeholders})
                AND c.is_active = 1
                AND e.is_active = 1`,
        )
        .bind(...authorizedClientIds)
        .all();

    const candidates = ((result as any).results || []) as Array<{
        id: string;
        client_id: string;
        url: string;
        secret_hash: string;
        events: string | null;
    }>;

    const targets: AppWebhookTarget[] = [];
    let skipped = 0;

    for (const row of candidates) {
        let events: AppWebhookEvent[];
        try {
            events = row.events ? JSON.parse(row.events) : [];
        } catch {
            events = [];
        }
        if (!events.includes(event)) continue;

        const plaintext = await getSecretPlaintext(row.id, row.secret_hash);
        if (!plaintext) {
            skipped++;
            console.warn(
                `[app-webhooks] no plaintext for endpoint ${row.id} (app ${row.client_id}) — skipped`,
            );
            continue;
        }

        targets.push({
            endpointId: row.id,
            clientId: row.client_id,
            url: row.url,
            secretPlaintext: plaintext,
            events,
        });
    }

    const deliveries = await Promise.allSettled(
        targets.map((t) => deliverOne(t, event, payload)),
    );

    let delivered = 0;
    let failed = 0;
    const stamps: Array<{
        endpointId: string;
        statusCode: number | null;
        error: string | null;
    }> = [];
    for (let i = 0; i < deliveries.length; i++) {
        const d = deliveries[i];
        const t = targets[i];
        if (d.status === "fulfilled") {
            const { ok, statusCode, error } = d.value;
            if (ok) delivered++;
            else failed++;
            stamps.push({
                endpointId: t.endpointId,
                statusCode,
                error,
            });
        } else {
            failed++;
            stamps.push({
                endpointId: t.endpointId,
                statusCode: null,
                error: String((d as PromiseRejectedResult).reason).slice(
                    0,
                    500,
                ),
            });
        }
    }

    if (stamps.length > 0) {
        await Promise.allSettled(
            stamps.map((s) =>
                db
                    .prepare(
                        `UPDATE oauth_client_webhook_endpoints
                            SET last_delivery_at = CURRENT_TIMESTAMP,
                                last_status_code = ?,
                                last_error = ?
                            WHERE id = ?`,
                    )
                    .bind(s.statusCode, s.error, s.endpointId)
                    .run(),
            ),
        );

        // Update the KV consecutive-failure counters and fire the
        // webhook_fail email when an endpoint crosses the threshold.
        // Done after stamping so the row reflects the latest attempt
        // when the email goes out.
        try {
            const { recordEndpointSuccess, recordEndpointFailure } =
                await import("./webhook-fail-alert");
            await Promise.allSettled(
                stamps.map((s, i) => {
                    const target = targets[i];
                    const okStatus =
                        s.statusCode !== null &&
                        s.statusCode >= 200 &&
                        s.statusCode < 300;
                    if (okStatus) {
                        return recordEndpointSuccess(s.endpointId);
                    }
                    return recordEndpointFailure(
                        s.endpointId,
                        s.statusCode,
                        s.error,
                        target.url,
                        target.clientId,
                    );
                }),
            );
        } catch (err) {
            console.error(
                "[app-webhooks] failure-counter update failed:",
                err instanceof Error ? err.message : err,
            );
        }
    }

    return { attempted: targets.length, delivered, failed, skipped };
}

async function deliverOne(
    target: AppWebhookTarget,
    event: AppWebhookEvent,
    payload: Record<string, unknown>,
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
    const eventId = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(payload);
    const signed = `${timestamp}.${body}`;

    const sig = await hmacSha256Hex(target.secretPlaintext, signed);

    const controller = new AbortController();
    const tm = setTimeout(() => controller.abort(), 5_000);

    try {
        const res = await fetch(target.url, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "X-Elixpo-Event-Id": eventId,
                "X-Elixpo-Event": event,
                "X-Elixpo-Timestamp": timestamp,
                "X-Elixpo-Signature": `sha256=${sig}`,
            },
            body,
        });
        return {
            ok: res.ok,
            statusCode: res.status,
            error: res.ok ? null : `HTTP ${res.status}`,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
            "[app-webhooks] delivery to %s failed: %s",
            target.url,
            msg,
        );
        return { ok: false, statusCode: null, error: msg.slice(0, 500) };
    } finally {
        clearTimeout(tm);
    }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message),
    );
    return bytesToHex(new Uint8Array(sig));
}

// ── Default KV-backed secret resolver ────────────────────────────────────

/**
 * Build a secret resolver that reads `webhook_secret:<endpointId>` from KV.
 *
 * Populate this key on endpoint creation and on rotation:
 *
 *   await env.KV.put(`webhook_secret:${endpointId}`, plaintext);
 *
 * Plaintext is never written to D1 — D1 holds the SHA-256 hash and KV holds
 * the plaintext. Losing the KV value means rotating the endpoint's secret.
 *
 * For migrated legacy endpoints (where endpoint_id == client_id by
 * backfill rule), the same KV key path keeps working — see migration
 * 0013_oauth_client_webhook_endpoints.sql.
 */
export function defaultSecretResolver(
    kv: KVNamespace,
): (endpointId: string, _hash: string) => Promise<string | null> {
    return async (endpointId, _hash) => {
        try {
            return await kv.get(`webhook_secret:${endpointId}`);
        } catch {
            return null;
        }
    };
}
