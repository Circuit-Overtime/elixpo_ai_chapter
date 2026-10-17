"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import {
    BaseUrlChip,
    Code,
    DocH2,
    DocLead,
    DocList,
    DocP,
    DocTitle,
    NextLink,
} from "./_components/docs-prose";

export default function DocsOverview() {
    return (
        <Box>
            <DocTitle>Elixpo Mails — Overview</DocTitle>
            <DocLead>
                Elixpo Mails is the transactional email layer for modern software. You bring your
                own sender, design templates with <Code>{"{{variable}}"}</Code> placeholders, attach
                a signed webhook to a template, and trigger sends from your service with an
                HMAC-signed POST. We handle delivery, suppression, and logging.
            </DocLead>
            <BaseUrlChip />

            <DocH2>What it is</DocH2>
            <DocP>
                Bring-your-own-sender, event-based transactional email. Your service fires a signed
                webhook when something happens — a sign-up, a receipt, a password reset — and Elixpo
                Mails renders the matching template and sends it from <em>your</em> mailbox. There
                is no shared relay pool; mail goes out as you.
            </DocP>

            <DocH2>Core objects</DocH2>
            <DocList
                items={[
                    <>
                        <strong>Workspace</strong> — your tenant. You sign in with Elixpo Accounts
                        (SSO).
                    </>,
                    <>
                        <strong>Sender</strong> — a connected mailbox (Gmail/SMTP + app password)
                        that mail is sent from.
                    </>,
                    <>
                        <strong>Product</strong> — a group of templates with one shared signing
                        secret, a footer, and a background colour. Creating one gives you a{" "}
                        <Code>client_id</Code> and a secret <strong>shown once</strong>.
                    </>,
                    <>
                        <strong>Template</strong> — the email design built in the lixeditor WYSIWYG
                        editor, with <Code>{"{{variables}}"}</Code> in subject and body and a{" "}
                        <Code>transactional</Code> flag.
                    </>,
                    <>
                        <strong>Webhook</strong> — a signed trigger endpoint attached to a template,
                        identified by an <Code>endpoint_key</Code>.
                    </>,
                    <>
                        <strong>Delivery log</strong> — one row per send: <Code>sent</Code> /{" "}
                        <Code>failed</Code> / <Code>suppressed</Code> / <Code>sending</Code>, with
                        recipient, template, webhook, error, and merged variables.
                    </>,
                ]}
            />

            <DocH2>How it fits together</DocH2>
            <DocP>
                The chain is:{" "}
                <strong>
                    workspace → senders → products → templates → webhooks → delivery logs
                </strong>
                . You set up senders and a product once, design templates as you need them, attach a
                webhook per template, then trigger sends from your code.
            </DocP>

            <NextLink href="/docs/quickstart" label="Quickstart" />
        </Box>
    );
}
