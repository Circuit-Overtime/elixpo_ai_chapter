import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: "https://status.elixpo.com",
            lastModified: new Date(),
            changeFrequency: "hourly",
            priority: 1,
        },
    ];
}
