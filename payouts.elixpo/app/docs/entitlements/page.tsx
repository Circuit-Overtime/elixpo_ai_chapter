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

const REQ = `GET /v1/entitlements?app=lixblogs&uid=u_123
Authorization: Bearer <ELIXPO_PAY_API_KEY>
# or:  X-Elixpo-Pay-Key: <ELIXPO_PAY_API_KEY>`;

const RES = `{
  "app": "lixblogs",
  "uid": "u_123",
  "tier": "member",
  "status": "active",      // active | expired | revoked | none
  "active": true,          // computed against expires_at for you
  "expires_at": "2026-07-16 12:00:00",
  "version": 3
}`;

const NONE = `{
  "app": "lixblogs",
  "uid": "u_999",
  "tier": "free",
  "status": "none",
  "active": false,
  "expires_at": null,
  "version": 0
}`;

export default function EntitlementsDocs() {
    return (
        <Box>
            <DocTitle>Entitlements API</DocTitle>
            <DocLead>
                A server-to-server endpoint to read a customer's current tier.
                Use it to gate features without trusting client state, or to
                reconcile if a webhook was missed.
            </DocLead>

            <DocH2>Request</DocH2>
            <CodeBlock code={REQ} language="http" />
            <DocP>
                Authenticate with your app's secret key (the{" "}
                <Code>pay_sk_…</Code>
                shown once on app creation). It's SHA-256 compared server-side —
                keep it server-only.
            </DocP>

            <DocH2>Response</DocH2>
            <CodeBlock code={RES} language="json" />
            <DocP>A customer with no entitlement returns a safe default:</DocP>
            <CodeBlock code={NONE} language="json" />

            <DocH2>Notes</DocH2>
            <DocList
                items={[
                    <>
                        <Code>active</Code> is the field to gate on — it already
                        accounts for expiry.
                    </>,
                    <>
                        Responses are <Code>no-store</Code>; always reflect the
                        latest grant.
                    </>,
                    <>
                        A missing or wrong key returns <Code>401</Code>; an
                        unknown app returns <Code>404</Code>.
                    </>,
                ]}
            />
        </Box>
    );
}
