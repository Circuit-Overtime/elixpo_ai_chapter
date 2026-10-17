import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Refund & Cancellation Policy",
    description:
        "How cancellations and refunds work for digital subscriptions billed through Elixpo Pay — duplicate charges, undelivered service, and how to request a refund.",
    alternates: { canonical: "/refunds" },
    openGraph: {
        title: "Refund & Cancellation Policy | Elixpo Pay",
        description:
            "Cancellation, refunds, and disputes for subscriptions billed through Elixpo Pay.",
        url: "https://payouts.elixpo.com/refunds",
    },
};

export default function RefundsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
