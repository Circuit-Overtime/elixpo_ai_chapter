"use client";

import LegalShell from "../components/legal-shell";

export default function TermsPage() {
    return (
        <LegalShell title="Terms of Service" updated="June 16, 2026">
            <p>
                These terms govern your use of Elixpo Pay (
                <code>payouts.elixpo.com</code>) and the Elixpo Pay API. By
                creating a merchant account or integrating the API, you agree to
                them.
            </p>

            <h2>The service</h2>
            <p>
                Elixpo Pay is a payments and payouts platform: a hosted
                checkout, instant access notifications (webhooks), and creator
                payouts. We act as a technical facilitator between you, your
                customers, and the underlying payment providers.
            </p>

            <h2>Merchant responsibilities</h2>
            <ul>
                <li>
                    Provide accurate business and payout information, and keep
                    it current.
                </li>
                <li>
                    Comply with the terms of any connected provider (Razorpay,
                    Stripe, etc.) and applicable law.
                </li>
                <li>
                    Sell only lawful products and honour the entitlements you
                    grant customers.
                </li>
                <li>
                    Keep your API keys and webhook secrets confidential. You are
                    responsible for activity under your keys.
                </li>
            </ul>

            <h2>Fees</h2>
            <p>
                Elixpo Pay may charge a platform fee (a small percentage and/or
                a flat per-transaction amount) on top of provider fees, plus
                payout fees where applicable. Fees in effect for your account
                are shown in your dashboard.
            </p>

            <h2>Payouts</h2>
            <p>
                Payouts are subject to provider settlement schedules, payout
                thresholds, and any required identity/KYC verification. We may
                hold funds where required to investigate fraud, disputes, or
                chargebacks.
            </p>

            <h2>Refunds & disputes</h2>
            <p>
                Refunds and chargebacks are processed through the originating
                provider. You are responsible for your own refund policy and for
                resolving disputes with your customers.
            </p>

            <h2>Availability & liability</h2>
            <p>
                The service is provided "as is" without warranties. To the
                maximum extent permitted by law, Elixpo's liability is limited
                to the fees you paid us in the preceding three months.
            </p>

            <h2>Changes</h2>
            <p>
                We may update these terms; material changes will be announced in
                the dashboard. Continued use after changes constitutes
                acceptance.
            </p>

            <h2>Contact</h2>
            <p>
                Questions? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
            </p>
        </LegalShell>
    );
}
