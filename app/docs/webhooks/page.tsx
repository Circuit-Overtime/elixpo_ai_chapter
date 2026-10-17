"use client";

import {
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
} from "@/components/docs-prose";
import { Box } from "@mui/material";
import CodeBlock from "../../components/code-block";

const HEADERS = `POST <your endpoint>
Content-Type: application/json
X-Elixpo-Pay-Event:     entitlement.updated
X-Elixpo-Pay-Timestamp: 1718500000
X-Elixpo-Pay-Signature: sha256=<hex HMAC of \`\${timestamp}.\${rawBody}\`>`;

const BODY = `{
  "id": "whd_…",
  "type": "entitlement.updated",
  "created": 1718500000,
  "data": {
    "app": "lixblogs",
    "uid": "u_123",
    "tier": "member",
    "status": "active",
    "active": true,
    "expires_at": "2026-07-16 12:00:00",
    "version": 3
  }
}`;

const PAYMENT = `{
  "id": "whd_…",
  "type": "payment.captured",
  "created": 1718500000,
  "data": {
    "app": "lixblogs",
    "uid": "u_123",
    "transaction_id": "txn_…",
    "provider_payment_id": "pay_…",
    "provider_order_id": "order_…",
    "currency": "INR",
    "amount": 19900,
    "tier": "member"
  }
}`;

const VERIFY = `import crypto from "node:crypto";

export async function POST(req) {
  const raw = await req.text();
  const ts = req.headers.get("x-elixpo-pay-timestamp");

  const expected = crypto
    .createHmac("sha256", process.env.ELIXPO_PAY_WEBHOOK_SECRET)
    .update(ts + "." + raw)
    .digest("hex");

  // The header may carry several comma-separated signatures during a secret
  // rotation grace window — accept if ANY matches.
  const sigs = (req.headers.get("x-elixpo-pay-signature") || "")
    .split(",")
    .map((s) => s.trim().replace("sha256=", ""));
  const ok = sigs.some(
    (s) => s.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))
  );
  if (!ok) return new Response("bad signature", { status: 401 });

  const evt = JSON.parse(raw);
  if (evt.type === "entitlement.updated") {
    // Upsert users.tier = evt.data.tier with expiry evt.data.expires_at,
    // ignoring deliveries with a lower data.version than you've seen.
  }
  return Response.json({ ok: true });
}`;

export default function WebhooksDocs() {
    return (
        <Box>
            <DocTitle>Webhooks</DocTitle>
            <DocLead>
                Elixpo Pay POSTs signed events to your app's webhook endpoint.
                Set the URL and choose which events to receive under{" "}
                <strong>Entitlement webhook</strong> on your product's page;
                verify each delivery with your per-app signing secret.
            </DocLead>

            <DocH2>Events you can subscribe to</DocH2>
            <DocList
                items={[
                    <>
                        <Code>entitlement.updated</Code> — a buyer's access was
                        granted, changed, or expired. <strong>Required</strong>{" "}
                        — this is how you fulfill purchases.
                    </>,
                    <>
                        <Code>payment.captured</Code> — a payment succeeded.
                        Optional; useful for receipts, analytics, or your own
                        ledger.
                    </>,
                ]}
            />
            <DocP>
                Each endpoint only receives the events it's subscribed to. The
                required event is always on; toggle the optional ones in the
                dashboard. More event types will appear here over time.
            </DocP>

            <DocH2>Set it up in the dashboard</DocH2>
            <DocP>
                Open your product → <strong>Entitlement webhook</strong>, then:
            </DocP>
            <DocList
                items={[
                    <>
                        <strong>Endpoint URL</strong> — the route in your app that receives
                        events (e.g. <Code>https://yourapp.com/api/billing/grant</Code>). Must
                        be <Code>https</Code>.
                    </>,
                    <>
                        <strong>☑ entitlement.updated</strong> — leave this on. It's how a
                        purchase actually unlocks access (and how downgrades/revocations
                        reach you). Without it, payments succeed but users never get access.
                    </>,
                    <>
                        <strong>☐ payment.captured</strong> — check this only if you want a
                        ping on every successful charge (receipts, your own analytics/ledger).
                        Not needed to grant access.
                    </>,
                    <>
                        <strong>Signing secret</strong> — copy the <Code>whsec_…</Code> shown
                        on save and store it as <Code>ELIXPO_PAY_WEBHOOK_SECRET</Code> in your
                        app. You verify every delivery with it. <strong>Roll secret</strong>{" "}
                        rotates it with a grace window (old + new both valid for a bit).
                    </>,
                ]}
            />
            <DocP>
                Respond <Code>2xx</Code> fast. Failures are recorded and shown as failed
                deliveries you can inspect.
            </DocP>

            <DocH2>Request</DocH2>
            <CodeBlock code={HEADERS} language="http" />
            <CodeBlock code={BODY} language="json" />

            <DocH2>payment.captured</DocH2>
            <DocP>
                Same envelope and signature; the <Code>type</Code> and{" "}
                <Code>data</Code> differ. Delivered only if you've enabled it.
            </DocP>
            <CodeBlock code={PAYMENT} language="json" />

            <DocH2>Subscription lifecycle (autopay tiers)</DocH2>
            <DocP>
                For autopay (recurring) prices we still surface everything
                through <Code>entitlement.updated</Code> — you do NOT
                subscribe to separate subscription events. The status flag
                on the payload tells you what changed:
            </DocP>
            <DocList
                items={[
                    <>
                        <strong>First charge / renewal:</strong>{" "}
                        <Code>{"{ active: true, status: 'active' }"}</Code>{" "}
                        with a new <Code>expires_at</Code> pushed forward
                        by one cycle. Treat the same as a one-time
                        purchase — the entitlement is granted.
                    </>,
                    <>
                        <strong>Buyer cancelled from your site:</strong>{" "}
                        <Code>{"{ active: true, status: 'cancelled' }"}</Code>{" "}
                        — fires immediately (we call this inline from{" "}
                        <Code>POST /v1/subscriptions/cancel</Code>, not at
                        period-end). Buyer keeps access until{" "}
                        <Code>expires_at</Code>, then a second event
                        arrives with <Code>active: false</Code>. Send the
                        cancellation confirmation email on this first
                        event; flip the tier in your DB on the second.
                    </>,
                    <>
                        <strong>Mandate ended (UPI revoke from GPay /
                        PhonePe, or repeated card failures):</strong>{" "}
                        <Code>{"{ active: true, status: 'halted', failed: true }"}</Code>{" "}
                        — Razorpay collapses both UPI mandate revocation
                        AND exhausted-retry card failures into a single
                        <Code>halted</Code> state. Treat as a cancellation
                        for UI / tier-state purposes (the sub will not
                        renew), AND surface "update payment to resume"
                        copy in case it was a card problem. Recovery is
                        possible if the buyer re-subscribes.
                    </>,
                ]}
            />
            <DocP>
                <strong>Three terminal-ish states map to one user-facing
                state:</strong>{" "}
                <Code>status: 'cancelled'</Code> (cancel API called),{" "}
                <Code>status: 'halted'</Code> (mandate broken — UPI
                revoked OR card declined), and the eventual{" "}
                <Code>active: false</Code> at period_end. All three
                should result in your app showing the same "subscription
                ended" UX with the buyer's access valid through{" "}
                <Code>expires_at</Code> on the first two and stopped on
                the third.
            </DocP>
            <CodeBlock
                code={`// example: cancelled-but-still-active envelope
{
  "id": "evt_…",
  "type": "entitlement.updated",
  "created": 1734812345,
  "data": {
    "app": "blogs",
    "uid": "u_123",
    "tier": "member",
    "active": true,
    "status": "cancelled",
    "expires_at": "2026-07-22 00:00:00",
    "provider_subscription_id": "sub_…"
  }
}`}
                language="json"
            />

            <DocH2>Verifying</DocH2>
            <DocP>
                Recompute the HMAC over{" "}
                <Code>{"`${timestamp}.${rawBody}`"}</Code>
                using your <Code>ELIXPO_PAY_WEBHOOK_SECRET</Code> (the{" "}
                <Code>whsec_…</Code> from the dashboard) and compare in constant
                time. Reject stale timestamps. Branch on <Code>type</Code> since
                one endpoint may receive several event types. When you roll the
                secret with a grace window, the signature header carries{" "}
                <strong>several comma-separated values</strong> (new + old) —
                accept if any matches, so you can redeploy without dropping
                deliveries.
            </DocP>
            <CodeBlock code={VERIFY} language="javascript" />

            <DocH2>Idempotency & ordering</DocH2>
            <DocList
                items={[
                    <>
                        Each entitlement carries a monotonic{" "}
                        <Code>version</Code> — ignore any{" "}
                        <Code>entitlement.updated</Code> whose version is ≤ the
                        one you've already applied.
                    </>,
                    <>
                        Respond <Code>2xx</Code> quickly; non-2xx responses are
                        recorded as failed deliveries for retry/inspection.
                    </>,
                    "The same grant may arrive from both the instant client confirmation and the provider webhook — fulfillment is idempotent on our side.",
                ]}
            />

            <DocH2>Revocation & account deletion</DocH2>
            <DocP>
                Elixpo Pay is wired to <strong>Elixpo Accounts</strong> (the
                identity source of truth). When a buyer{" "}
                <strong>deletes their account</strong> or revokes your app
                there, Elixpo Pay automatically{" "}
                <strong>cancels their subscription</strong> (it never renews —
                billing stops) and <strong>revokes the entitlement</strong>.
            </DocP>
            <DocList
                items={[
                    <>
                        You receive a final <Code>entitlement.updated</Code>{" "}
                        with <Code>status: "revoked"</Code> and{" "}
                        <Code>active: false</Code> — handle it like any
                        downgrade and drop the user to your free tier.
                    </>,
                    "This is automatic; you don't call anything. It happens whether or not the buyer still has time left on the period.",
                    "For one-time (P0) plans there's no recurring charge to stop — cancelling the subscription just prevents the next grant. For future recurring plans, the provider mandate is cancelled too.",
                ]}
            />
        </Box>
    );
}
