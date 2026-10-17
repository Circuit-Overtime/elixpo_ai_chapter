import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Terms of Service",
    description:
        "The terms governing use of Elixpo Pay — the payments and payouts platform: merchant responsibilities, fees, payouts, refunds, and liability.",
    alternates: { canonical: "/terms" },
    openGraph: {
        title: "Terms of Service | Elixpo Pay",
        description:
            "Terms governing Elixpo Pay's payments and payouts platform.",
        url: "https://payouts.elixpo.com/terms",
    },
};

export default function TermsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
