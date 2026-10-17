import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const runtime = "edge";

export const metadata: Metadata = {
    title: "Authentication & User Management Pricing",
    description:
        "Start authentication and user management free for up to 1,000 monthly active users per app. Compare Hobby, Indie, and Studio plans for growing products.",
    alternates: { canonical: "/pricing" },
    openGraph: {
        url: "/pricing",
        title: "Authentication & User Management Pricing",
        description:
            "Start free, then scale SSO, OAuth apps, webhooks, and user management as your product grows.",
        images: [
            {
                url: "/og-image.png",
                width: 1280,
                height: 720,
                alt: "Elixpo Accounts Pricing Plans",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Authentication & User Management Pricing",
        description:
            "Start free, then scale SSO, OAuth apps, webhooks, and user management as your product grows.",
        images: ["/og-image.png"],
    },
};

export default function PricingPage() {
    return <PricingClient />;
}
