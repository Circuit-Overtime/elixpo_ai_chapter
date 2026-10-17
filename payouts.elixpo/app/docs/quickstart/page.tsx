"use client";

import { Box } from "@mui/material";
import {
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
} from "@/components/docs-prose";
import CodeBlock from "../../components/code-block";

const FLOW = `// In your app (server-side), when a user upgrades:
const res = await fetch("https://payouts.elixpo.com/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.ELIXPO_PAY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tier: "member",                 // the product tier
    currency: "INR",                // we resolve the catalog price
    customer: { uid: user.id, email: user.email },
    success_url: "https://blogs.elixpo.com/settings",
  }),
});

const session = await res.json();
redirect(session.url); // hosted checkout — no card data touches your app`;

const READ = `// After payment, read the entitlement any time:
const res = await fetch(
  "https://payouts.elixpo.com/v1/entitlements?app=lixblogs&uid=" + user.id,
  { headers: { Authorization: "Bearer " + process.env.ELIXPO_PAY_API_KEY } }
);
const ent = await res.json();
// { app, uid, tier, status, active, expires_at, version }`;

export default function Quickstart() {
    return (
        <Box>
            <DocTitle>Quickstart</DocTitle>
            <DocLead>
                Three steps: create a checkout session, receive the grant
                webhook, and read entitlements. You need just two credentials —
                a secret key and a webhook signing secret — from your product's
                page in the dashboard.
            </DocLead>

            <DocH2>1. Get your credentials</DocH2>
            <DocList
                items={[
                    <>
                        <Code>ELIXPO_PAY_API_KEY</Code> — your app's secret key.
                        Authenticates the checkout and entitlements APIs (shown
                        once on creation; roll it from the product page).
                    </>,
                    <>
                        <Code>ELIXPO_PAY_WEBHOOK_SECRET</Code> — the per-app
                        signing secret (<Code>whsec_…</Code>) you verify inbound
                        webhooks with. Set your webhook URL and reveal it under{" "}
                        <strong>Entitlement webhook</strong>.
                    </>,
                ]}
            />
            <DocP>
                There is no shared handoff secret — the secret key both starts
                checkout and reads entitlements.
            </DocP>

            <DocH2>2. Define your tiers (in code)</DocH2>
            <DocP>
                Products and prices are managed from a catalog file in your
                repo, pushed with your secret key — not from the dashboard. See{" "}
                <Code>Catalog sync</Code>. Until a tier has an active price,
                checkout for it will 404.
            </DocP>

            <DocH2>3. Create a checkout session</DocH2>
            <DocP>
                Call the API with your secret key and redirect the buyer to the
                returned URL. Elixpo Pay resolves the price from your catalog,
                so the amount is never sent by you and can't be tampered with.
            </DocP>
            <CodeBlock code={FLOW} language="javascript" />

            <DocH2>4. Read entitlements</DocH2>
            <DocP>
                After a successful payment we push a webhook (see Webhooks). You
                can also pull the current state at any time:
            </DocP>
            <CodeBlock code={READ} language="javascript" />
        </Box>
    );
}
