import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Elixpo Pay — Payments & Payouts",
        short_name: "Elixpo Pay",
        description:
            "Hosted checkout, unified ledger, entitlements, and creator payouts for the Elixpo ecosystem.",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0d12",
        theme_color: "#0b0d12",
        categories: ["finance", "business", "developer"],
        icons: [
            { src: "/icon.png", sizes: "256x256", type: "image/png" },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
