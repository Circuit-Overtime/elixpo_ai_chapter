"use client";

export const runtime = "edge";

import { Box } from "@mui/material";
import { Callout, Code, DocH2, DocLead, DocList, DocP, DocTitle } from "../_components/docs-prose";

export default function Deliverability() {
    return (
        <Box>
            <DocTitle>Gmail deliverability</DocTitle>
            <DocLead>
                Elixpo Mails sends through your connected SMTP provider. We produce standards-based
                MIME, preserve aligned provider authentication, use TLS, and add RFC 8058
                unsubscribe headers where appropriate. Your domain authentication, consent, volume,
                and reputation still determine inbox placement.
            </DocLead>

            <Callout tone="warn" title="Inbox placement cannot be guaranteed">
                Gmail does not offer allowlisting, and accepting a message over SMTP is not the same
                as placing it in the inbox. Treat anyone promising guaranteed placement as a risk.
            </Callout>

            <DocH2>Required sender setup</DocH2>
            <DocList
                items={[
                    "Publish SPF for the infrastructure authorized to send your domain's mail.",
                    <>
                        Enable DKIM at your SMTP provider and make sure its <Code>d=</Code> domain
                        aligns with the visible From domain.
                    </>,
                    <>
                        Publish DMARC at <Code>_dmarc.your-domain</Code>. Start with monitoring,
                        review reports, then move toward enforcement.
                    </>,
                    "Use a provider with valid forward and reverse DNS and TLS. Elixpo Mails always connects to SMTP over implicit TLS or STARTTLS.",
                    "Use truthful From names and subjects. Send only expected mail to consented recipients.",
                ]}
            />

            <DocH2>Gmail volume and reputation</DocH2>
            <DocP>
                Google requires stronger controls for senders approaching 5,000 messages per day to
                personal Gmail accounts: SPF and DKIM, DMARC, aligned authentication, TLS, low spam
                rates, and one-click unsubscribe for promotional mail. Keep Postmaster Tools spam
                rates below 0.10% and never let them reach 0.30%.
            </DocP>
            <DocList
                items={[
                    "Ramp volume gradually instead of sending sudden spikes from a new domain or mailbox.",
                    "Remove invalid and persistently unengaged recipients; never use purchased or scraped lists.",
                    "Monitor Google Postmaster Tools, SMTP rejections, delivery logs, and recipient complaints.",
                    "Keep transactional and promotional streams logically separate when your provider supports it.",
                ]}
            />

            <DocH2>What Elixpo Mails adds</DocH2>
            <DocList
                items={[
                    "A unique Message-ID, valid Date header, plain-text alternative, and UTF-8 quoted-printable MIME encoding.",
                    "RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers for non-transactional product mail.",
                    "Suppression checks before non-transactional delivery and an unsubscribe link in the message body.",
                    "A platform DKIM signature only when its signing domain aligns with the visible From domain; otherwise the connected SMTP provider remains responsible for DKIM.",
                ]}
            />

            <DocH2>Verify before production</DocH2>
            <DocP>
                Send a test to a Gmail account, open “Show original,” and confirm SPF, DKIM, and
                DMARC all pass for the domain recipients see. Then register the domain in{" "}
                <a href="https://postmaster.google.com/" target="_blank" rel="noreferrer">
                    Google Postmaster Tools
                </a>
                . Recheck after changing DNS, SMTP providers, aliases, or From domains.
            </DocP>
            <DocP>
                Current requirements are maintained in Google&apos;s{" "}
                <a
                    href="https://support.google.com/mail/answer/81126"
                    target="_blank"
                    rel="noreferrer"
                >
                    Email sender guidelines
                </a>
                .
            </DocP>
        </Box>
    );
}
