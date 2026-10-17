"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect } from "react";

export default function TermsContent() {
    useEffect(() => {
        gsap.fromTo(
            ".gsap-terms-animate",
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
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-[#192837] gsap-terms-animate">
                Terms of Service
            </h1>
            <p className="text-sm opacity-60 font-semibold mb-10 gsap-terms-animate">
                Effective: 22 June 2026 · Last updated: 22 June 2026
            </p>

            <div className="flex flex-col gap-10">
                <Section title="1. Agreement to terms">
                    By creating an Elixpo Accounts account or using any Elixpo
                    product that authenticates via Elixpo Accounts, you agree to
                    these Terms. If you don't agree, don't use the service.
                </Section>

                <Section title="2. What we provide">
                    Elixpo Accounts is a single sign-on and OAuth 2.0 identity
                    provider. You can sign in with your Elixpo Accounts identity
                    to first-party Elixpo products and to third-party
                    applications that integrate with us.
                </Section>

                <Section title="3. Your account">
                    <ul className="list-disc pl-5 flex flex-col gap-3">
                        <li>
                            You must be at least 13 years old to use Elixpo
                            Accounts.
                        </li>
                        <li>
                            You are responsible for keeping your credentials,
                            second factors, and backup codes confidential.
                        </li>
                        <li>
                            You agree to provide accurate information and update
                            it when it changes.
                        </li>
                        <li>
                            We may suspend or terminate accounts that violate
                            these Terms, are used for fraud or abuse, or are
                            inactive for an extended period (we'll notify you
                            first when possible).
                        </li>
                    </ul>
                </Section>

                <Section title="4. Multi-factor authentication">
                    We require two-factor authentication for accounts that own
                    three or more OAuth apps. You are responsible for keeping a
                    working second factor on file and your backup codes in a
                    safe place. Lost access to all factors may require manual
                    recovery and reasonable proof of identity.
                </Section>

                <Section title="5. OAuth apps you register">
                    If you register an OAuth application:
                    <ul className="list-disc pl-5 flex flex-col gap-3 mt-3">
                        <li>
                            You must accurately represent your app to end users
                            on the consent screen.
                        </li>
                        <li>
                            You must comply with our scope contract — use the
                            user data we share only for the purposes you
                            disclosed.
                        </li>
                        <li>
                            Webhook endpoints must be HTTPS (except localhost in
                            development) and you must verify our signature on
                            every request.
                        </li>
                        <li>
                            You may not impersonate Elixpo or any other entity.
                        </li>
                    </ul>
                </Section>

                <Section title="6. Paid tiers">
                    Indie and Studio tiers are billed monthly in INR via
                    Razorpay through Elixpo Pay. By subscribing to a paid tier
                    you authorize us to charge your chosen payment method on
                    each renewal date until you cancel. We'll email a receipt
                    for each charge and a notice if a charge fails. Test pricing
                    may be in effect at launch; the real recurring prices are
                    listed on{" "}
                    <Link
                        href="/pricing"
                        className="text-[#7342E2] hover:underline font-semibold"
                    >
                        /pricing
                    </Link>
                    .
                </Section>

                <Section title="7. Refunds">
                    Subscriptions are non-refundable for the current period. If
                    you cancel, you keep access until the end of the period
                    you've paid for, and we won't charge you again. Contact{" "}
                    <a
                        href="mailto:support@elixpo.com"
                        className="text-[#7342E2] hover:underline font-semibold"
                    >
                        support@elixpo.com
                    </a>{" "}
                    within 7 days of any disputed charge.
                </Section>

                <Section title="8. Acceptable use">
                    You agree not to:
                    <ul className="list-disc pl-5 flex flex-col gap-3 mt-3">
                        <li>
                            Probe, scan, or test the service for vulnerabilities
                            without our prior written consent.
                        </li>
                        <li>
                            Use the service to send spam, phishing, or any
                            unlawful content.
                        </li>
                        <li>
                            Attempt to bypass rate limits, quotas, or abuse
                            prevention measures.
                        </li>
                        <li>
                            Reverse-engineer or attempt to extract other users'
                            personal data.
                        </li>
                    </ul>
                </Section>

                <Section title="9. Intellectual property">
                    The Elixpo brand, logos, and product code are our property.
                    Code that we open-source is licensed under its stated
                    license (typically MIT). Site assets are licensed CC-BY-4.0
                    except for the Elixpo wordmark and trademarks, which are
                    reserved.
                </Section>

                <Section title="10. Disclaimer of warranties">
                    The service is provided on an "as is" and "as available"
                    basis. To the maximum extent permitted by law, we disclaim
                    all warranties, express or implied, including
                    merchantability, fitness for a particular purpose, and
                    non-infringement.
                </Section>

                <Section title="11. Limitation of liability">
                    To the maximum extent permitted by law, our total liability
                    to you for any claim arising from or related to the service
                    will not exceed the amount you paid us in the 12 months
                    preceding the claim, or ₹1,000, whichever is greater.
                </Section>

                <Section title="12. Governing law">
                    These Terms are governed by the laws of India, without
                    regard to conflict-of-laws principles. Disputes will be
                    resolved exclusively in the courts located in the Republic
                    of India.
                </Section>

                <Section title="13. Changes">
                    We may update these Terms from time to time. For material
                    changes we'll notify you via email or an in-app banner at
                    least 14 days before they take effect. Continued use of the
                    service after the change constitutes acceptance.
                </Section>

                <Section title="14. Contact">
                    Questions about these terms:{" "}
                    <a
                        href="mailto:support@elixpo.com"
                        className="text-[#7342E2] hover:underline font-semibold"
                    >
                        support@elixpo.com
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
        <div className="gsap-terms-animate">
            <h2 className="font-heading text-lg sm:text-xl font-bold mb-3 text-[#192837]">
                {title}
            </h2>
            <div className="text-sm sm:text-base opacity-80 leading-relaxed font-body">
                {children}
            </div>
        </div>
    );
}
