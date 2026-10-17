import type { Metadata } from "next";
import { LegalList, LegalP, LegalSection, LegalShell } from "../components/legal-shell";

// NOTE: This is a good-faith, product-specific template. Have it reviewed by
// counsel before relying on it in production.

const UPDATED = "June 17, 2026";

export const metadata: Metadata = {
    title: "Content & Acceptable Use Policy",
    description:
        "What you may and may not send through mail.elixpo — consent requirements, prohibited content, sending practices, and enforcement.",
    alternates: { canonical: "/content-policy" },
};

export default function ContentPolicyPage() {
    return (
        <LegalShell
            title="Content & Acceptable Use Policy"
            updated={UPDATED}
            intro="This policy defines what you may send through mail.elixpo. It exists to protect recipients, sender reputations, and the integrity of the service. It applies to every message you trigger, regardless of which sender you use."
        >
            <LegalSection heading="1. Consent and relationship">
                <LegalP>
                    You may only email people who have a genuine relationship with you or who have
                    consented to hear from you. mail.elixpo is built for transactional and
                    operational email — messages a recipient expects as a result of an action they
                    took.
                </LegalP>
                <LegalList
                    items={[
                        "No purchased, rented, scraped, or harvested recipient lists.",
                        "No sending to addresses obtained without a clear, lawful basis.",
                        "Honor opt-outs and unsubscribe requests promptly where applicable.",
                    ]}
                />
            </LegalSection>

            <LegalSection heading="2. Prohibited content and use">
                <LegalList
                    items={[
                        "Unsolicited bulk or commercial email (spam).",
                        "Phishing, credential harvesting, spoofing, or impersonation.",
                        "Malware, viruses, or links to malicious or deceptive destinations.",
                        "Content that is illegal, infringing, fraudulent, or that facilitates harm.",
                        "Harassment, hate, or content that violates the rights or safety of others.",
                        "Evading filters, rate limits, suppression, or attempting to disguise the true sender or purpose of a message.",
                    ]}
                />
            </LegalSection>

            <LegalSection heading="3. Sending practices">
                <LegalP>
                    Because you send through your own connected senders, you are responsible for
                    following your mailbox provider’s policies and for maintaining your domain’s
                    authentication (such as SPF, DKIM, and DMARC) where applicable. Accurate “from”
                    identities and truthful subject lines are required.
                </LegalP>
            </LegalSection>

            <LegalSection heading="4. Recipient data">
                <LegalP>
                    Send only the recipient data necessary to deliver a message. You are responsible
                    for the lawfulness of the recipient addresses and variables you submit, and for
                    responding to recipient privacy requests as the controller of that data.
                </LegalP>
            </LegalSection>

            <LegalSection heading="5. Enforcement">
                <LegalP>
                    We may investigate suspected violations and may throttle, suspend, or terminate
                    sending or accounts that breach this policy, with or without notice where
                    necessary to protect recipients or the service. Repeated or severe violations
                    may result in permanent termination.
                </LegalP>
            </LegalSection>

            <LegalSection heading="6. Reporting abuse">
                <LegalP>
                    If you believe mail.elixpo is being used to send abusive or unlawful email,
                    report it to abuse@elixpo.com with relevant details so we can investigate.
                </LegalP>
            </LegalSection>
        </LegalShell>
    );
}
