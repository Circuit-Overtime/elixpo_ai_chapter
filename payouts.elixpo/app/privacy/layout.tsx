import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description:
        "How Elixpo Pay collects, uses, and protects data for payments and payouts. We never store raw card or bank details.",
    alternates: { canonical: "/privacy" },
    openGraph: {
        title: "Privacy Policy | Elixpo Pay",
        description:
            "How Elixpo Pay handles your data across payments and payouts.",
        url: "https://payouts.elixpo.com/privacy",
    },
};

export default function PrivacyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
