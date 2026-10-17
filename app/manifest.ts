import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "mail.elixpo — Event-based transactional email",
        short_name: "mail.elixpo",
        description:
            "Bring your own sender, design templates with {{variables}}, and trigger transactional email via webhook on Cloudflare's edge.",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0d12",
        theme_color: "#0b0d12",
        categories: ["business", "productivity", "developer"],
        icons: [
            { src: "/icon.png", sizes: "256x256", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
