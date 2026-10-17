import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "The Platform",
    description:
        "Add payments and payouts to your platform with one integration. Elixpo Pay charges your customers and pays your creators — Razorpay today, Stripe coming soon for international.",
    alternates: { canonical: "/about" },
    openGraph: {
        title: "The Platform | Elixpo Pay",
        description:
            "Add payments and payouts to your platform with one integration — we charge your customers and pay your creators. Razorpay today, Stripe coming soon.",
        url: "https://payouts.elixpo.com/about",
    },
};

export default function AboutLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
