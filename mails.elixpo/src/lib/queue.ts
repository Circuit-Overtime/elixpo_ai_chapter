/**
 * Cloudflare Queue producer access (Pages side).
 *
 * The send path is synchronous-first: /v1/hooks/:key attempts the SMTP relay
 * inline and only enqueues when that first attempt fails with a *transient*
 * error. The message is intentionally tiny — just the delivery id — so it can
 * never breach the 128 KB queue-message limit (a prepared email with Drive
 * attachments easily would) and no decrypted SMTP password is ever persisted at
 * rest in the queue. The consumer Worker re-runs the full pipeline from the
 * delivery row (see app/v1/internal/redeliver).
 */

import type { Queue } from "@cloudflare/workers-types";

/**
 * Two queues (names must match wrangler.toml + workers/smtp-sender):
 *   elixpo-mail-send       — drives (re)send attempts; CF retries with backoff.
 *   elixpo-mail-send-retry — the failed-email queue: where the send queue's
 *                            exhausted messages land for one last attempt before
 *                            the delivery is marked permanently failed.
 */
export const SEND_QUEUE_NAME = "elixpo-mail-send";
export const SEND_RETRY_QUEUE_NAME = "elixpo-mail-send-retry";

export interface SendRetryJob {
    /** The deliveries row to re-attempt. Everything else is rebuilt from it. */
    deliveryId: string;
}

async function getSendQueue(): Promise<Queue | null> {
    try {
        const { getRequestContext } = await import(
            /* webpackIgnore: true */ "@cloudflare/next-on-pages"
        );
        const env = (getRequestContext() as any).env;
        if (env?.SEND_QUEUE) return env.SEND_QUEUE as Queue;
    } catch {
        // Not on the Cloudflare runtime (local `next dev`) — no queue binding.
    }
    return null;
}

/**
 * Enqueue a retry job. Returns false when no queue binding is available (local
 * dev, or the binding isn't wired) so callers can fall back to marking the
 * delivery failed instead of silently dropping it.
 */
export async function enqueueRetry(job: SendRetryJob): Promise<boolean> {
    const q = await getSendQueue();
    if (!q) return false;
    try {
        await q.send(job);
        return true;
    } catch {
        return false;
    }
}
