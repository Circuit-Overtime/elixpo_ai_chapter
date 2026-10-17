import type { Metadata } from "next";
import { LegalList, LegalP, LegalSection, LegalShell } from "../components/legal-shell";

// NOTE: This is a good-faith, product-specific template. Have it reviewed by
// counsel before relying on it in production.

const UPDATED = "June 17, 2026";

export const metadata: Metadata = {
    title: "Terms of Service",
    description:
        "The terms governing your use of mail.elixpo — accounts, sender credentials, acceptable use, API credentials, availability, and liability.",
    alternates: { canonical: "/terms" },
    openGraph: {
        title: "Terms of Service — Elixpo Mails",
        description:
            "The terms governing your use of mail.elixpo — accounts, sender credentials, acceptable use, API credentials, availability, and liability.",
        images: ["/og-image.png"],
    },
};

export default function TermsPage() {
    return (
        <LegalShell
            title="Terms of Service"
            updated={UPDATED}
            intro="These terms govern your access to and use of mail.elixpo. By signing in and using the service, you agree to them on behalf of yourself and the business you represent."
        >
            <LegalSection heading="1. The service">
                <LegalP>
                    mail.elixpo lets you connect your own email senders, design templates with
                    variable placeholders, and trigger transactional email sends from your systems
                    via an API and webhook. We render and relay messages through the sender you
                    configure; we are not your mailbox provider and do not act as the sender of
                    record.
                </LegalP>
            </LegalSection>

            <LegalSection heading="2. Accounts">
                <LegalP>
                    Access requires authentication through Elixpo Accounts. You are responsible for
                    maintaining the security of your account and for all activity under it. Each
                    authenticated user maps to one tenant.
                </LegalP>
            </LegalSection>

            <LegalSection heading="3. Your senders and credentials">
                <LegalList
                    items={[
                        "You represent that you are authorized to send email from each sender you connect, and that doing so complies with that provider’s terms.",
                        "You are responsible for the app passwords and API credentials you create. Keep secret keys confidential; rotate them if exposed.",
                        "You are responsible for the content of your templates and the recipient data you submit.",
                    ]}
                />
            </LegalSection>

            <LegalSection heading="4. Acceptable use">
                <LegalP>
                    You must use mail.elixpo only for legitimate, consented transactional and
                    operational email, and in compliance with our{" "}
                    <a
                        href="/content-policy"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                        Content &amp; Acceptable Use Policy
                    </a>{" "}
                    and applicable laws, including anti-spam laws such as CAN-SPAM, CASL, and the
                    GDPR/ePrivacy regime. You may not use the service to send unsolicited bulk
                    email, phishing, malware, or unlawful content.
                </LegalP>
            </LegalSection>

            <LegalSection heading="5. Availability and changes">
                <LegalP>
                    We work to keep the service reliable but provide it on an “as is” and “as
                    available” basis without warranties of any kind. We may modify, suspend, or
                    discontinue features, and we may update these terms; your continued use after
                    changes constitutes acceptance.
                </LegalP>
            </LegalSection>

            <LegalSection heading="6. Suspension and termination">
                <LegalP>
                    We may suspend or terminate access if you violate these terms or the Content
                    &amp; Acceptable Use Policy, or to protect the service, its users, or
                    recipients. You may stop using the service at any time and delete your senders,
                    templates, and configurations.
                </LegalP>
            </LegalSection>

            <LegalSection heading="7. Limitation of liability">
                <LegalP>
                    To the maximum extent permitted by law, mail.elixpo and Elixpo will not be
                    liable for indirect, incidental, special, consequential, or exemplary damages,
                    or for lost profits, data, or goodwill, arising from your use of the service.
                    Nothing in these terms limits liability that cannot be limited under applicable
                    law.
                </LegalP>
            </LegalSection>

            <LegalSection heading="8. Contact">
                <LegalP>Questions about these terms can be sent to hello@elixpo.com.</LegalP>
            </LegalSection>
        </LegalShell>
    );
}
