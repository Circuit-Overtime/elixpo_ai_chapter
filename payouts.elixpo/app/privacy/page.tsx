"use client";

import LegalShell from "../components/legal-shell";

export default function PrivacyPage() {
    return (
        <LegalShell title="Privacy Policy" updated="June 16, 2026">
            <p>
                Elixpo Pay ("Elixpo Pay", "we", "us") provides payments and
                payouts infrastructure for the Elixpo ecosystem and third-party
                merchants. This policy explains what we collect, why, and how we
                handle it. It applies to <code>payouts.elixpo.com</code> and the
                Elixpo Pay API.
            </p>

            <h2>What we collect</h2>
            <ul>
                <li>
                    <strong>Merchant account data</strong> — your Elixpo
                    Accounts identity (user id, email, display name) used to
                    sign in and own your merchant workspace.
                </li>
                <li>
                    <strong>Customer references</strong> — the external user id
                    (uid) your app passes us at checkout, plus optional email.
                    We do not require end-customers to create an Elixpo account.
                </li>
                <li>
                    <strong>Transaction metadata</strong> — amounts, currency,
                    provider order/payment ids, status, and timestamps.
                </li>
                <li>
                    <strong>Entitlements</strong> — the tier and expiry granted
                    to a customer after a successful payment.
                </li>
            </ul>
            <p>
                We <strong>never store raw card or bank details</strong>.
                Payment instruments are handled entirely by our payment
                providers (e.g. Razorpay), keeping card data out of our systems.
            </p>

            <h2>How we use it</h2>
            <ul>
                <li>
                    To process payments and record the resulting entitlements.
                </li>
                <li>To deliver signed webhooks back to your application.</li>
                <li>
                    To power your merchant dashboard and reporting.
                </li>
                <li>
                    To detect fraud, reconcile against provider reports, and
                    meet legal/tax obligations.
                </li>
            </ul>

            <h2>Sharing</h2>
            <p>
                We share data with payment and payout providers strictly to
                execute the transactions you initiate, and with Elixpo Accounts
                for authentication. We do not sell personal data.
            </p>

            <h2>Retention</h2>
            <p>
                Financial records are retained as required for accounting and
                regulatory compliance. You may request deletion of non-essential
                data; some records must be retained to satisfy legal
                obligations.
            </p>

            <h2>Contact</h2>
            <p>
                Questions? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>.
            </p>
        </LegalShell>
    );
}
