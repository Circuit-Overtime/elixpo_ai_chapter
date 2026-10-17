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

const TEMPLATE = `Subject: Your order {{order_id}} shipped, {{name}}!

Hi {{name}},

Your order {{order_id}} is on its way. Track it here: {{tracking_url}}

Thanks for shopping with us.`;

const PAYLOAD = `{
  "to": "ada@example.com",
  "variables": {
    "name": "Ada",
    "order_id": "1024",
    "tracking_url": "https://track.example.com/1024"
  }
}`;

export default function Templates() {
    return (
        <Box>
            <DocTitle>Templates &amp; variables</DocTitle>
            <DocLead>
                Templates are designed in the lixeditor WYSIWYG editor. Use{" "}
                <Code>{"{{variable}}"}</Code> placeholders in the subject and body; at send time
                each is replaced with the matching value from the trigger's <Code>variables</Code>{" "}
                object.
            </DocLead>

            <DocH2>Using variables</DocH2>
            <DocP>
                Drop <Code>{"{{var}}"}</Code> anywhere in the subject or body. Elixpo Mails{" "}
                <strong>derives the variable list automatically</strong> from the placeholders in
                the template — you don't declare them separately.
            </DocP>
            <CodeBlock code={TEMPLATE} language="text" />
            <DocP>The matching trigger supplies those keys:</DocP>
            <CodeBlock code={PAYLOAD} language="json" />

            <DocH2>The transactional flag</DocH2>
            <DocP>
                Each template has a <Code>transactional</Code> flag. When <strong>on</strong>, the
                message bypasses unsubscribe/suppression and carries no unsubscribe headers — use it
                for essential mail like <strong>receipts and password resets</strong>. When{" "}
                <strong>off</strong>, the send is subject to suppression and gets{" "}
                <Code>List-Unsubscribe</Code> headers.
            </DocP>
            <Callout title="Use transactional sparingly">
                Reserve the transactional flag for mail the recipient must receive to use your
                service. Marketing or digest mail should stay non-transactional so unsubscribe is
                respected.
            </Callout>

            <DocH2>Built-in variables</DocH2>
            <DocList
                items={[
                    <>
                        <Code>{"{{unsubscribe_url}}"}</Code> — a one-click unsubscribe link,
                        available in non-transactional templates.
                    </>,
                ]}
            />

            <DocH2>Product footer &amp; background</DocH2>
            <DocP>
                Every send inherits its <strong>product's footer</strong> — <Code>logo</Code>,{" "}
                <Code>address</Code>, <Code>phone</Code>, and a <Code>quote</Code> — plus the
                product's <strong>background colour</strong>. Set these once on the product page and
                they apply to all of its templates, so your brand stays consistent across emails.
            </DocP>

            <NextLink href="/docs/attachments" label="Attachments" />
        </Box>
    );
}
