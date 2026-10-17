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

const VAR_ATTACH = `{
  "to": "ada@example.com",
  "variables": {
    "name": "Ada",
    "invoice_url": "https://files.example.com/inv/1024.pdf"
  }
}`;

export default function Attachments() {
    return (
        <Box>
            <DocTitle>Attachments</DocTitle>
            <DocLead>
                A template can carry attachments. There are three kinds, and they can be mixed on
                one template.
            </DocLead>

            <DocH2>The three kinds</DocH2>
            <DocList
                items={[
                    <>
                        <strong>Google Drive file</strong> — picked via the Drive account connected
                        to your workspace. The same file is attached to every send.
                    </>,
                    <>
                        <strong>URL</strong> — a fixed link that Elixpo Mails fetches and attaches
                        at send time.
                    </>,
                    <>
                        <strong>
                            <Code>{"{{variable}}"}</Code>
                        </strong>{" "}
                        — a per-send attachment resolved from the trigger's variables. The value is
                        a URL fetched per recipient — e.g. <Code>{"{{invoice_url}}"}</Code> for a
                        personalised invoice.
                    </>,
                ]}
            />

            <DocH2>Per-send variable attachments</DocH2>
            <DocP>
                Configure the attachment as <Code>{"{{invoice_url}}"}</Code> on the template, then
                pass the resolved URL in each trigger:
            </DocP>
            <CodeBlock code={VAR_ATTACH} language="json" />

            <DocH2>Size caps</DocH2>
            <DocList
                items={[
                    <>
                        <strong>10 MB</strong> per file.
                    </>,
                    <>
                        <strong>18 MB</strong> per message (total across all attachments).
                    </>,
                ]}
            />
            <Callout title="Exceeding the caps" tone="warn">
                A send whose attachments exceed these limits fails. For large files, link to them in
                the body (or attach a small file and link the rest) instead of attaching the whole
                payload.
            </Callout>

            <NextLink href="/docs/unsubscribe" label="Unsubscribe" />
        </Box>
    );
}
