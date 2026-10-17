import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const runtime = "edge";

export const metadata: Metadata = {
    title: "Pricing",
    description:
        "Flexible, developer-friendly pricing plans for Elixpo Mails. Start sending up to 1,000 transactional emails for free and upgrade as your volume scales.",
    openGraph: {
        title: "Pricing Plans — Elixpo Mails",
        description:
            "Flexible, developer-friendly pricing plans for Elixpo Mails. Start sending up to 1,000 transactional emails for free and upgrade as your volume scales.",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Elixpo Mails Pricing Plans",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Pricing Plans — Elixpo Mails",
        description:
            "Flexible, developer-friendly pricing plans for Elixpo Mails. Start sending up to 1,000 transactional emails for free and upgrade as your volume scales.",
        images: ["/og-image.png"],
    },
};

export default function PricingPage() {
    return <PricingClient />;
}
