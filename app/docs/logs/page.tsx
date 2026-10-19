"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import { Callout, Code, DocH2, DocLead, DocList, DocP, DocTitle } from "../_components/docs-prose";

export default function Logs() {
    return (
        <Box>
            <DocTitle>Delivery logs</DocTitle>
            <DocLead>
                Every send attempt produces a delivery log entry, so you can see exactly what
                happened to each email — and replay or debug failures.
            </DocLead>

            <DocH2>Statuses</DocH2>
            <DocList
                items={[
                    <>
                        <Code>sent</Code> — accepted by the sender's mailbox.
                    </>,
                    <>
                        <Code>failed</Code> — a downstream send failure; see the <Code>error</Code>{" "}
                        field.
                    </>,
                    <>
                        <Code>suppressed</Code> — the recipient was unsubscribed; the send was
                        skipped (a successful no-op).
                    </>,
                    <>
                        <Code>sending</Code> — in flight.
                    </>,
                ]}
            />

            <DocH2>What each log records</DocH2>
            <DocList
                items={[
                    <>
                        <strong>Recipient</strong> — the <Code>to</Code> address.
                    </>,
                    <>
                        <strong>Template</strong> — which template was rendered.
                    </>,
                    <>
                        <strong>Webhook</strong> — the endpoint the trigger came through.
                    </>,
                    <>
                        <strong>Error</strong> — the failure reason, when status is{" "}
                        <Code>failed</Code>.
                    </>,
                    <>
                        <strong>Merged variables</strong> — the exact <Code>variables</Code> object
                        used for the send.
                    </>,
                ]}
            />

            <DocH2>Idempotency</DocH2>
            <DocP>
                Pass an <Code>idempotency_key</Code> in the trigger body to dedupe retries. A
                repeated request with the same key resolves to the original delivery instead of
                sending again — safe to retry on network errors.
            </DocP>
            <Callout title="Reuse keys for natural events">
                Derive the key from the event that caused the send (e.g. the order ID or a
                password-reset token) so accidental double-fires collapse to one email.
            </Callout>
        </Box>
    );
}
