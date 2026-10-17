import type { Metadata } from "next";
import { LegalList, LegalP, LegalSection, LegalShell } from "../components/legal-shell";

// NOTE: This is a good-faith, product-specific template. Have it reviewed by
// counsel before relying on it in production.

const UPDATED = "June 17, 2026";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description:
        "How mail.elixpo collects, uses, encrypts, and retains data — account identity, sender credentials, template content, and delivery logs.",
    alternates: { canonical: "/privacy" },
    openGraph: {
        title: "Privacy Policy — Elixpo Mails",
        description:
            "How mail.elixpo collects, uses, encrypts, and retains data — account identity, sender credentials, template content, and delivery logs.",
        images: ["/og-image.png"],
    },
};

export default function PrivacyPage() {
    return (
        <LegalShell
            title="Privacy Policy"
            updated={UPDATED}
            intro="mail.elixpo (“mail.elixpo”, “we”, “us”) provides event-based transactional email for businesses. This policy explains what data we process when you use the service, why, and the choices you have. It covers two distinct roles: data about you as an account holder, and data you send us about your email recipients."
        >
            <LegalSection heading="1. Who controls your data">
                <LegalP>
                    For account and configuration data, mail.elixpo acts as the data controller. For
                    the recipient data you submit when you trigger a send (recipient addresses and
                    template variables), you are the controller and mail.elixpo is your processor —
                    we process that data only to deliver the email you asked us to send, on your
                    instructions.
                </LegalP>
            </LegalSection>

            <LegalSection heading="2. Data we collect">
                <LegalList
                    items={[
                        "Account identity — when you sign in through Elixpo Accounts (SSO), we receive your user id, email address, display name, and avatar. We do not receive or store your Elixpo Accounts password.",
                        "Sender credentials — the email address and app password for each sender you connect. App passwords are encrypted at rest and are never returned through the dashboard or API.",
                        "Templates — the content you author in the editor, including subjects, layout, and {{variable}} placeholders.",
                        "Email configs & API credentials — per-config client identifiers and a one-way hash of each secret key (we never store the secret itself).",
                        "Send & delivery data — recipient email addresses, the variables you pass, resolved subjects, delivery status, timestamps, and SMTP responses, recorded as delivery logs.",
                        "Operational data — basic request metadata and logs used to run, secure, and debug the service.",
                    ]}
                />
            </LegalSection>

            <LegalSection heading="3. How we use data">
                <LegalList
                    items={[
                        "To authenticate you and operate your tenant (senders, templates, configs).",
                        "To render templates and relay messages through the sender you configured.",
                        "To maintain delivery logs so you can audit and troubleshoot sends.",
                        "To secure the service, prevent abuse, and meet legal obligations.",
                    ]}
                />
                <LegalP>
                    We do not sell your data, and we do not use the content of your templates or the
                    recipient data you submit to train models or for advertising.
                </LegalP>
            </LegalSection>

            <LegalSection heading="4. Sub-processors and infrastructure">
                <LegalP>
                    The service runs on Cloudflare’s edge platform (including D1 and KV storage).
                    Authentication is provided by Elixpo Accounts. When you send email, the message
                    is delivered through the SMTP provider of the sender you connect (for example,
                    your own mailbox provider) — that provider processes the message and recipient
                    address to deliver it.
                </LegalP>
            </LegalSection>

            <LegalSection heading="5. Encryption and security">
                <LegalP>
                    Sender app passwords are encrypted at rest using authenticated encryption. API
                    secret keys are stored only as one-way hashes and shown to you once at creation.
                    Traffic is served over TLS. No system is perfectly secure, but we apply
                    least-privilege access and encrypt the most sensitive fields.
                </LegalP>
            </LegalSection>

            <LegalSection heading="6. Retention and deletion">
                <LegalP>
                    We retain account, sender, template, and config data for as long as your tenant
                    is active. Delivery logs are retained to support auditing and may be pruned over
                    time. If your Elixpo Accounts user is deleted, we receive a signed revocation
                    event and purge the associated senders, templates, and configurations. You may
                    also delete senders, templates, and configs yourself at any time from the
                    dashboard.
                </LegalP>
            </LegalSection>

            <LegalSection heading="7. Your rights">
                <LegalP>
                    Depending on your jurisdiction, you may have rights to access, correct, export,
                    or delete your personal data. Because much of the recipient data we hold is
                    processed on your behalf, requests from your recipients should be directed to
                    you as the controller; we will assist you in fulfilling them. To exercise your
                    own rights, contact us at the address below.
                </LegalP>
            </LegalSection>

            <LegalSection heading="8. Changes to this policy">
                <LegalP>
                    We may update this policy as the service evolves. Material changes will be
                    reflected by updating the “last updated” date above, and where appropriate we
                    will notify account holders.
                </LegalP>
            </LegalSection>
        </LegalShell>
    );
}
