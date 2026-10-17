// mail.elixpo SMTP sender Worker.
// The one component that opens raw TCP (Pages edge routes can't). The Pages app
// calls POST /send server-to-server with a shared secret; this Worker relays the
// message through the tenant's own SMTP credentials over cloudflare:sockets.
// It is ALSO the Cloudflare Queue consumer for elixpo-mail-send (fast retries)
// and elixpo-mail-send-retry (the bridge to the Workflow) — see queue() — and it
// hosts MailRetryWorkflow, the durable long-horizon retry (see bottom of file).

import { WorkflowEntrypoint } from "cloudflare:workers";
import { sendMail } from "./smtp.js";

const REQUIRED = ["host", "user", "pass", "from", "to"];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/") {
            return json({ ok: true, service: "mail.elixpo smtp-sender" });
        }
        if (request.method !== "POST" || url.pathname !== "/send") {
            return json({ ok: false, error: "not_found" }, 404);
        }

        // Shared-secret auth (server-to-server only).
        const secret = env.SMTP_SENDER_SECRET;
        if (!secret) return json({ ok: false, error: "sender_misconfigured" }, 500);
        if (!timingSafeEqual(request.headers.get("x-sender-secret") || "", secret)) {
            return json({ ok: false, error: "unauthorized" }, 401);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ ok: false, error: "invalid_json" }, 400);
        }

        const missing = REQUIRED.filter((k) => !body?.[k]);
        if (missing.length) {
            return json({ ok: false, error: `missing: ${missing.join(", ")}` }, 400);
        }

        try {
            const result = await sendMail({
                host: body.host,
                port: body.port,
                secure: body.secure,
                user: body.user,
                pass: body.pass,
                from: body.from,
                fromName: body.fromName,
                to: body.to,
                subject: body.subject,
                html: body.html,
                text: body.text,
                attachments: Array.isArray(body.attachments) ? body.attachments : [],
                listUnsubscribe: body.listUnsubscribe || null,
                // Pass the Worker env through so the SMTP module can
                // reach DKIM_PRIVATE_KEY / DKIM_DOMAIN / DKIM_SELECTOR
                // and sign the message before transmission. When those
                // aren't set on the env, signing is skipped and the
                // unsigned message goes out — preserves current
                // behaviour for unconfigured deployments.
                env,
            });
            return json(result, 200);
        } catch (err) {
            return json({ ok: false, error: String(err?.message || err) }, 502);
        }
    },

    // Cloudflare Queue consumer. Two queues are bound (see wrangler.toml):
    //   elixpo-mail-send        — fast (re)send attempts; CF retries with backoff
    //                             over minutes, then dead-letters into the retry
    //                             queue once max_retries is hit.
    //   elixpo-mail-send-retry  — the bridge: if a message that exhausted the fast
    //                             retries is STILL only transiently failing, hand
    //                             it to MailRetryWorkflow for durable, hour-scale
    //                             backoff. Permanent/sent outcomes just resolve.
    // The Worker stays thin: it can't reach D1 / the encryption key / the render
    // logic, so it calls back into the Pages app's /v1/internal/redeliver, which
    // owns the full pipeline. The shared SMTP_SENDER_SECRET authenticates us.
    async queue(batch, env) {
        const isRetryQueue = batch.queue?.endsWith("-retry");
        for (const msg of batch.messages) {
            const deliveryId = msg.body?.deliveryId;
            if (!deliveryId) {
                msg.ack(); // malformed — nothing we can do, don't loop on it.
                continue;
            }
            try {
                const res = await redeliver(env, deliveryId, false);
                if (res.retryable === true && isRetryQueue) {
                    // Fast retries are spent and it's still transient → escalate
                    // to the durable Workflow for long-horizon backoff, then ack.
                    await startRetryWorkflow(env, deliveryId);
                    msg.ack();
                } else if (res.retryable === true) {
                    // Still on the fast queue → let CF retry with backoff.
                    msg.retry();
                } else {
                    msg.ack(); // terminal: sent or hard-failed.
                }
            } catch (_err) {
                // Couldn't even reach the Pages app — let the queue retry the
                // whole job later so the delivery isn't silently dropped.
                msg.retry();
            }
        }
    },
};

/**
 * MailRetryWorkflow — durable, long-horizon retry. A delivery only lands here
 * after the queue's fast retries are exhausted and it's still failing for a
 * transient reason. Each step is durable: the Worker can evict between sleeps and
 * resume hours later without losing place. After the schedule is exhausted the
 * delivery is marked permanently failed.
 *
 * (Future: item #5 — emit a "delivery permanently failed" notification to the
 * tenant from the give-up step.)
 */
const RETRY_SCHEDULE = ["30 minutes", "2 hours", "6 hours", "24 hours"];

export class MailRetryWorkflow extends WorkflowEntrypoint {
    async run(event, step) {
        const deliveryId = event.payload?.deliveryId;
        if (!deliveryId) return;

        for (let i = 0; i < RETRY_SCHEDULE.length; i++) {
            await step.sleep(`backoff-${i}`, RETRY_SCHEDULE[i]);
            const res = await step.do(`attempt-${i}`, () => redeliver(this.env, deliveryId, false));
            // Resolved (sent, or hard-failed and already marked) → we're done.
            if (res.retryable !== true) return;
        }

        // Schedule exhausted and still transiently failing → give up for good.
        await step.do("give-up", () => redeliver(this.env, deliveryId, true));
    }
}

/** Kick off the durable retry Workflow, keyed by delivery id so a delivery can't
 *  have two concurrent retry instances. Falls back to marking the delivery failed
 *  if the Workflow binding isn't available (e.g. not yet deployed). */
async function startRetryWorkflow(env, deliveryId) {
    if (!env.RETRY_WORKFLOW) {
        await redeliver(env, deliveryId, true); // no Workflow → resolve as failed.
        return;
    }
    try {
        await env.RETRY_WORKFLOW.create({ id: `retry-${deliveryId}`, params: { deliveryId } });
    } catch (_err) {
        // An instance for this delivery already exists — it's already being
        // retried, so there's nothing more to do.
    }
}

/** Call the Pages app to (re)run the send pipeline for one delivery. */
async function redeliver(env, deliveryId, final) {
    const base = env.PAGES_INTERNAL_URL;
    const secret = env.SMTP_SENDER_SECRET;
    if (!base || !secret)
        throw new Error("redeliver not configured (PAGES_INTERNAL_URL / SMTP_SENDER_SECRET)");
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/internal/redeliver`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sender-secret": secret },
        body: JSON.stringify({ deliveryId, final: final === true }),
    });
    if (!res.ok) throw new Error(`redeliver endpoint ${res.status}`);
    return res.json();
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
