import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OreoOS — Open-source ESP32-S3 Badge",
    short_name: "OreoOS",
    description: "Explore, build, and extend the open-source OreoOS conference badge.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F0C1C",
    theme_color: "#0F0C1C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
