import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Pricing",
    description:
        "Simple, usage-based pricing for Elixpo Pay — pay only when you get paid. A flat platform fee per successful transaction, on top of your provider's fees.",
    alternates: { canonical: "/pricing" },
    openGraph: {
        title: "Pricing | Elixpo Pay",
        description:
            "Usage-based pricing — a flat platform fee per successful transaction. No setup cost, no monthly minimum to start.",
        url: "https://payouts.elixpo.com/pricing",
    },
};

export default function PricingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
