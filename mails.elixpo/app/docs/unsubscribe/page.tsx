"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
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

export default function Unsubscribe() {
    return (
        <Box>
            <DocTitle>Unsubscribe &amp; suppression</DocTitle>
            <DocLead>
                Suppression is managed by the platform. You don't maintain an unsubscribe list
                yourself — Elixpo Mails adds the right headers, handles opt-outs, and skips
                suppressed recipients automatically.
            </DocLead>

            <DocH2>How it works</DocH2>
            <DocList
                items={[
                    <>
                        Every <strong>non-transactional</strong> send carries{" "}
                        <Code>List-Unsubscribe</Code> and one-click{" "}
                        <Code>List-Unsubscribe-Post</Code> headers.
                    </>,
                    "When a recipient unsubscribes, they're added to the suppression list.",
                    <>
                        Future non-transactional sends to a suppressed recipient are{" "}
                        <strong>skipped</strong>, the delivery is logged as <Code>suppressed</Code>,
                        and the trigger returns{" "}
                        <Code>200 {'{ ok: false, status: "suppressed" }'}</Code>.
                    </>,
                    <>
                        <strong>Transactional</strong> sends (receipts, resets) are never
                        suppressed.
                    </>,
                ]}
            />

            <DocH2>In-body unsubscribe link</DocH2>
            <DocP>
                Use <Code>{"{{unsubscribe_url}}"}</Code> inside a template to render an in-body
                unsubscribe link, in addition to the header-based one-click option.
            </DocP>

            <DocH2>Managing the list</DocH2>
            <DocP>
                View and manage the suppression list on the <strong>product page</strong>.
                Suppression is scoped per product.
            </DocP>
            <Callout title="Suppressed is a success">
                A <Code>suppressed</Code> response means the platform correctly respected an opt-out
                — treat it as a successful no-op in your code, not a failure to retry.
            </Callout>

            <NextLink href="/docs/logs" label="Delivery logs" />
        </Box>
    );
}
