"use client";

import gsap from "gsap";
import { useEffect } from "react";

export default function PrivacyContent() {
    useEffect(() => {
        gsap.fromTo(
            ".gsap-privacy-animate",
            { opacity: 0, y: 25 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out",
            },
        );
    }, []);

    return (
        <main className="w-full max-w-[760px] mx-auto px-5 sm:px-8 py-8 sm:py-16 relative z-10 flex-1">
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-[#192837] gsap-privacy-animate">
                Privacy Policy
            </h1>
            <p className="text-sm opacity-60 font-semibold mb-10 gsap-privacy-animate">
                Effective: 22 June 2026 · Last updated: 22 June 2026
            </p>

            <div className="flex flex-col gap-10">
                <Section title="1. Who we are">
                    Elixpo Accounts (the "Service") is operated by Elixpo. We
                    provide single sign-on, OAuth identity, and account
                    management for the Elixpo product suite and for third-party
                    applications you grant access to.
                </Section>

                <Section title="2. Information we collect">
                    <ul className="list-disc pl-5 flex flex-col gap-3">
                        <li>
                            <strong className="text-[#192837] font-semibold">
                                Account information:
                            </strong>{" "}
                            email address, display name, profile photo, and
                            optional username — provided by you or your social
                            login provider (Google, GitHub, Discord, Microsoft).
                        </li>
                        <li>
                            <strong className="text-[#192837] font-semibold">
                                Authentication signals:
                            </strong>{" "}
                            a hash of your IP address and a short user-agent
                            string for each session, kept to detect suspicious
                            sign-ins. We do not store raw IP addresses.
                        </li>
                        <li>
                            <strong className="text-[#192837] font-semibold">
                                Multi-factor secrets:
                            </strong>{" "}
                            when you enroll TOTP, passkeys, or email OTP, we
                            store the secrets in encrypted form on Cloudflare D1
                            and KV.
                        </li>
                        <li>
                            <strong className="text-[#192837] font-semibold">
                                OAuth app metadata:
                            </strong>{" "}
                            if you register an OAuth app, we store the app name,
                            redirect URIs, webhook endpoints, and a hashed copy
                            of the client secret.
                        </li>
                        <li>
                            <strong className="text-[#192837] font-semibold">
                                Billing data:
                            </strong>{" "}
                            when you subscribe to a paid tier, we store your
                            tier and renewal date. Card details are handled
                            exclusively by our payments partner (Razorpay via
                            Elixpo Pay); we never see or store card numbers.
                        </li>
                    </ul>
                </Section>

                <Section title="3. How we use your information">
                    <ul className="list-disc pl-5 flex flex-col gap-3">
                        <li>To authenticate you and your sessions.</li>
                        <li>
                            To deliver service emails (verification, sign-in
                            alerts, billing notifications) via our transactional
                            mail provider (Elixpo Mails).
                        </li>
                        <li>
                            To detect and prevent abuse, fraud, and account
                            takeover.
                        </li>
                        <li>
                            To honor your OAuth consents and forward only the
                            profile attributes you approved to the third-party
                            app.
                        </li>
                        <li>
                            To process payments and provision entitlements
                            through Elixpo Pay.
                        </li>
                    </ul>
                </Section>

                <Section title="4. Sharing">
                    We share your data only with:
                    <ul className="list-disc pl-5 flex flex-col gap-3 mt-3">
                        <li>
                            OAuth applications you explicitly grant access — and
                            only the attributes the app requested in its scopes.
                        </li>
                        <li>
                            Service providers we depend on: Cloudflare (hosting,
                            D1, KV), Razorpay (payments), and the identity
                            providers you sign in with.
                        </li>
                        <li>
                            Legal authorities, when compelled by a valid legal
                            process applicable in our operating jurisdiction.
                        </li>
                    </ul>
                    <p className="mt-4 font-semibold text-[#192837]">
                        We do not sell your personal data.
                    </p>
                </Section>

                <Section title="5. Data retention">
                    We keep account data for as long as your account is active.
                    When you delete your account, we permanently delete or
                    anonymize your records within 30 days, except where
                    retention is required by law (e.g. invoices and audit logs,
                    which we keep for the period required by Indian tax law).
                </Section>

                <Section title="6. Security">
                    We use industry-standard encryption (TLS in transit, AES-GCM
                    at rest for sensitive fields), HMAC-signed webhooks, and
                    hardware-backed JWT signing keys. We support hardware
                    passkeys, TOTP, and email OTP as second factors; users with
                    three or more OAuth apps must enroll a second factor.
                </Section>

                <Section title="7. Your rights">
                    Depending on where you live, you may have rights to access,
                    correct, export, or delete your personal data. Email{" "}
                    <a
                        href="mailto:privacy@elixpo.com"
                        className="text-[#7342E2] hover:underline font-semibold"
                    >
                        privacy@elixpo.com
                    </a>{" "}
                    and we'll respond within 30 days.
                </Section>

                <Section title="8. Children">
                    Elixpo Accounts is not directed at children under 13. If you
                    become aware that a child has provided us with personal
                    data, please contact us so we can delete it.
                </Section>

                <Section title="9. Changes">
                    We may update this policy from time to time. If we make
                    material changes we'll notify you via email or an in-app
                    banner at least 14 days before the change takes effect.
                </Section>

                <Section title="10. Contact">
                    Questions about this policy:{" "}
                    <a
                        href="mailto:privacy@elixpo.com"
                        className="text-[#7342E2] hover:underline font-semibold"
                    >
                        privacy@elixpo.com
                    </a>
                    .
                </Section>
            </div>
        </main>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="gsap-privacy-animate">
            <h2 className="font-heading text-lg sm:text-xl font-bold mb-3 text-[#192837]">
                {title}
            </h2>
            <div className="text-sm sm:text-base opacity-80 leading-relaxed font-body">
                {children}
            </div>
        </div>
    );
}
