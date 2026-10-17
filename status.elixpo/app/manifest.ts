import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Elixpo Status",
        short_name: "Elixpo Status",
        description:
            "Live operational status and uptime history for every Elixpo service.",
        start_url: "/",
        display: "standalone",
        background_color: "#faf9f7",
        theme_color: "#faf9f7",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
        ],
    };
}
