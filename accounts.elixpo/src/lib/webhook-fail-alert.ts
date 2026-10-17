/**
 * Webhook-failure alert dispatcher.
 *
 * Tracks consecutive delivery failures per endpoint in KV. When the count
 * crosses FAIL_THRESHOLD, fires a `webhook_fail` mail to the app owner
 * (once per 24h cooldown so a persistently-broken endpoint doesn't spam
 * them every time an event fires).
 *
 * Counters live in KV (cheap, no D1 schema change) and self-reset on the
 * next successful delivery — the standard "consecutive failures" pattern.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDatabase } from "./d1-client";
import { sendMail } from "./mails";

const FAIL_THRESHOLD = 5; // consecutive failures before we alert
const ALERT_COOLDOWN_SECONDS = 24 * 60 * 60; // once per day per endpoint
const COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60; // entries auto-expire

const counterKey = (endpointId: string) => `wh_fail_count:${endpointId}`;
const alertKey = (endpointId: string) => `wh_fail_alert:${endpointId}`;

function getKv(): KVNamespace | null {
    try {
        return (getRequestContext().env as any).KV as KVNamespace;
    } catch {
        return null;
    }
}

/** Reset the counter for an endpoint on a successful delivery. */
export async function recordEndpointSuccess(endpointId: string): Promise<void> {
    const kv = getKv();
    if (!kv) return;
    try {
        await kv.delete(counterKey(endpointId));
    } catch {
        /* non-fatal */
    }
}

/**
 * Increment the counter on failure. If we cross the threshold AND the
 * cooldown window is clear, fire the alert email.
 */
export async function recordEndpointFailure(
    endpointId: string,
    statusCode: number | null,
    errorText: string | null,
    endpointUrl: string,
    clientId: string,
): Promise<void> {
    const kv = getKv();
    if (!kv) return;

    let nextCount: number;
    try {
        const current = await kv.get(counterKey(endpointId));
        nextCount = (current ? parseInt(current, 10) : 0) + 1;
        await kv.put(counterKey(endpointId), String(nextCount), {
            expirationTtl: COUNTER_TTL_SECONDS,
        });
    } catch (err) {
        console.error(
            "[webhook-fail-alert] KV counter update failed:",
            err instanceof Error ? err.message : err,
        );
        return;
    }

    if (nextCount < FAIL_THRESHOLD) return;

    // Cooldown gate — don't re-alert within 24h for the same endpoint.
    try {
        const inCooldown = await kv.get(alertKey(endpointId));
        if (inCooldown) return;
        await kv.put(alertKey(endpointId), "1", {
            expirationTtl: ALERT_COOLDOWN_SECONDS,
        });
    } catch {
        /* if the cooldown read fails, fall through and risk an extra email — better than missing the alert */
    }

    // Resolve the owner so we know who to email.
    try {
        const db = await getDatabase();
        const owner = await db
            .prepare(
                `SELECT c.name AS app_name, u.email AS email, u.display_name AS display_name
                 FROM oauth_clients c
                 JOIN users u ON u.id = c.owner_id
                 WHERE c.client_id = ?`,
            )
            .bind(clientId)
            .first<{
                app_name: string;
                email: string;
                display_name: string | null;
            }>();
        if (!owner?.email) return;

        const APP_URL =
            process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com";

        await sendMail("webhook_fail", owner.email, {
            name: owner.display_name || owner.email.split("@")[0],
            app_name: owner.app_name,
            endpoint_url: endpointUrl,
            failure_count: nextCount,
            last_status_code: statusCode ?? "—",
            last_error: errorText ?? "—",
            manage_url: `${APP_URL}/dashboard/oauth-apps/${clientId}`,
        });
    } catch (err) {
        console.error(
            "[webhook-fail-alert] alert dispatch failed:",
            err instanceof Error ? err.message : err,
        );
    }
}
