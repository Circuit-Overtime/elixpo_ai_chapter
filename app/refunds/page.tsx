"use client";

import LegalShell from "../components/legal-shell";

export default function RefundsPage() {
    return (
        <LegalShell
            title="Refund & Cancellation Policy"
            updated="June 17, 2026"
        >
            <p>
                Elixpo Pay processes payments for digital subscriptions to
                Elixpo's own software products (such as Elixpo Blogs Member). As
                these are digital, non-tangible services delivered immediately,
                the following policy applies to cancellations and refunds.
            </p>

            <h2>Cancellation</h2>
            <p>
                You can cancel a subscription at any time from your account
                settings on the relevant Elixpo product. Cancellation stops the
                next renewal — your access continues until the end of the period
                you've already paid for, after which the plan reverts to free.
            </p>

            <h2>Refunds</h2>
            <ul>
                <li>
                    <strong>Duplicate or accidental charges</strong> are fully
                    refunded. Contact us within <strong>7 days</strong> with
                    your payment reference.
                </li>
                <li>
                    <strong>Service not delivered</strong> — if a successful
                    payment did not unlock the purchased benefit, we will either
                    grant access or issue a full refund.
                </li>
                <li>
                    <strong>Unused time</strong> on a current billing period is
                    generally non-refundable, since access remains active for
                    the full paid period after cancellation.
                </li>
            </ul>
            <p>
                Approved refunds are returned to the original payment method,
                processed through our payment provider (Razorpay), and typically
                settle within <strong>5–7 business days</strong> depending on
                your bank.
            </p>

            <h2>How to request a refund</h2>
            <p>
                Email <a href="mailto:hello@elixpo.com">hello@elixpo.com</a>{" "}
                from your account email with your payment/transaction reference
                and a short description. We respond within 2 business days.
            </p>

            <h2>Chargebacks & disputes</h2>
            <p>
                If you believe a charge is incorrect, please contact us first —
                we can resolve most issues faster than a bank dispute.
                Chargebacks are handled through the originating provider.
            </p>

            <h2>Contact</h2>
            <p>
                Questions about this policy? Email{" "}
                <a href="mailto:hello@elixpo.com">hello@elixpo.com</a> or visit
                our <a href="/contact">contact page</a>.
            </p>
        </LegalShell>
    );
}
