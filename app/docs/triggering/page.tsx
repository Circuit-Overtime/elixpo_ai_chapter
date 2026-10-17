"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import CodeBlock from "../_components/code-block";
import { Code, DocH2, DocLead, DocList, DocP, DocTitle, NextLink } from "../_components/docs-prose";

const REQUEST = `POST https://mails.elixpo.com/v1/hooks/<endpoint_key>
Content-Type: application/json
X-Elixpo-Signature: t=<unix_seconds>,v1=<hex HMAC-SHA256>

{
  "to": "user@example.com",
  "variables": { "name": "Ada" },
  "idempotency_key": "optional-dedupe-key"
}`;

const SENT = `{
  "ok": true,
  "id": "del_...",
  "status": "sent",
  "to": "user@example.com",
  "subject": "Welcome, Ada"
}`;

const SUPPRESSED = `{
  "ok": false,
  "status": "suppressed",
  "to": "user@example.com"
}`;

const FAILED = `{
  "ok": false,
  "status": "failed",
  "error": "smtp: 535 authentication failed"
}`;

export default function Triggering() {
    return (
        <Box>
            <DocTitle>Triggering</DocTitle>
            <DocLead>
                Send an email by POSTing a signed request to the template's webhook endpoint. The{" "}
                <Code>endpoint_key</Code> is shown on each webhook.
            </DocLead>

            <DocH2>Endpoint</DocH2>
            <DocP>
                <Code>POST https://mails.elixpo.com/v1/hooks/&lt;endpoint_key&gt;</Code>
            </DocP>

            <DocH2>Request</DocH2>
            <CodeBlock code={REQUEST} language="http" />
            <DocList
                items={[
                    <>
                        <Code>to</Code> — recipient email address. Required.
                    </>,
                    <>
                        <Code>variables</Code> — object of <Code>{"{{var}}"}</Code> values merged
                        into the template's subject and body.
                    </>,
                    <>
                        <Code>idempotency_key</Code> — optional dedupe key (or pass an{" "}
                        <Code>Idempotency-Key</Code> request header); the same key won't send twice
                        — a duplicate returns the original result (good for retries).
                    </>,
                ]}
            />

            <DocH2>Responses</DocH2>
            <DocP>
                <strong>200 — sent.</strong> The email was accepted by your sender's mailbox.
            </DocP>
            <CodeBlock code={SENT} language="json" />
            <DocP>
                <strong>200 — suppressed.</strong> The recipient previously unsubscribed, so a
                non-transactional send is skipped. This is a successful no-op, not an error — handle
                it as success.
            </DocP>
            <CodeBlock code={SUPPRESSED} language="json" />
            <DocP>
                <strong>502 — failed.</strong> A downstream send failure (e.g. the sender mailbox
                rejected it). Inspect <Code>error</Code>.
            </DocP>
            <CodeBlock code={FAILED} language="json" />

            <DocH2>Error statuses</DocH2>
            <DocList
                items={[
                    <>
                        <Code>401</Code> — bad or missing signature.
                    </>,
                    <>
                        <Code>400</Code> — invalid timestamp (outside the 5-minute tolerance) or
                        invalid recipient.
                    </>,
                    <>
                        <Code>403</Code> — disabled webhook/product, or no signing secret
                        configured.
                    </>,
                    <>
                        <Code>404</Code> — unknown <Code>endpoint_key</Code>.
                    </>,
                ]}
            />

            <NextLink href="/docs/templates" label="Templates" />
        </Box>
    );
}
