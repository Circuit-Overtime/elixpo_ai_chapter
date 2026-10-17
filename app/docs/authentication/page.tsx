"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import CodeBlock from "../_components/code-block";
import {
    Callout,
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
    NextLink,
} from "../_components/docs-prose";

const HEADER = "X-Elixpo-Signature: t=1718500000,v1=9f8a...e21c";

const SIGN = `import crypto from "node:crypto";

const secret = "YOUR_PRODUCT_SECRET";

// 1. Serialize the body ONCE. These are the exact bytes you will send.
const rawBody = JSON.stringify({ to: "user@example.com", variables: { name: "Ada" } });

// 2. Current unix time in seconds.
const t = Math.floor(Date.now() / 1000);

// 3. HMAC-SHA256 over \`\${t}.\${rawBody}\` with the product secret.
const v1 = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");

// 4. Send the header alongside the SAME rawBody.
const signature = \`t=\${t},v1=\${v1}\`;`;

export default function Authentication() {
    return (
        <Box>
            <DocTitle>Authentication</DocTitle>
            <DocLead>
                Every trigger request is authenticated by an HMAC-SHA256 signature computed with
                your product's shared secret. There is no bearer token — the signature both
                authenticates you and proves the body wasn't tampered with.
            </DocLead>

            <DocH2>The signature header</DocH2>
            <DocP>
                Send your signature in the <Code>X-Elixpo-Signature</Code> header. It carries a
                timestamp and a v1 HMAC, comma-separated:
            </DocP>
            <CodeBlock code={HEADER} language="http" />
            <DocList
                items={[
                    <>
                        <Code>t</Code> — the unix time in <strong>seconds</strong> when you signed
                        the request.
                    </>,
                    <>
                        <Code>v1</Code> — the hex-encoded HMAC-SHA256.
                    </>,
                ]}
            />

            <DocH2>What you sign</DocH2>
            <DocP>
                The signed payload string is <Code>{"`${t}.${rawBody}`"}</Code> — the timestamp, a
                literal dot, then the <strong>exact JSON body bytes</strong> you send. The HMAC key
                is the product's shared secret.
            </DocP>
            <CodeBlock code={SIGN} language="javascript" />
            <Callout title="Sign the bytes you send" tone="warn">
                Serialize the body once and reuse that exact string for both the signature and the
                request body. If you re-serialize (e.g. let a framework stringify it again), the
                bytes can differ and the signature will fail with <Code>401</Code>.
            </Callout>

            <DocH2>Timestamp tolerance</DocH2>
            <DocP>
                Requests whose <Code>t</Code> is outside a <strong>5-minute</strong> tolerance of
                server time are rejected with <Code>400</Code>. Sign each request fresh at send
                time; don't cache signatures.
            </DocP>

            <DocH2>Secret rotation</DocH2>
            <DocP>
                When you roll a product's secret, the{" "}
                <strong>previous secret is still accepted for a short grace window</strong>. This
                lets you deploy the new secret without dropping in-flight requests. After the window
                closes, only the new secret works.
            </DocP>

            <DocH2>Why a request is rejected</DocH2>
            <DocList
                items={[
                    <>
                        <Code>401</Code> — bad or missing signature.
                    </>,
                    <>
                        <Code>400</Code> — invalid timestamp (outside tolerance) or invalid
                        recipient.
                    </>,
                    <>
                        <Code>403</Code> — the webhook/product is disabled, or no signing secret is
                        configured.
                    </>,
                ]}
            />

            <NextLink href="/docs/triggering" label="Triggering" />
        </Box>
    );
}
