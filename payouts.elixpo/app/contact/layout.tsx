import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Contact",
    description:
        "Contact Elixpo Pay for billing, payment, or integration questions. Operated by Elixpo — email hello@elixpo.com.",
    alternates: { canonical: "/contact" },
    openGraph: {
        title: "Contact | Elixpo Pay",
        description:
            "Reach Elixpo Pay for billing, payments, and integration support.",
        url: "https://payouts.elixpo.com/contact",
    },
};

export default function ContactLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
