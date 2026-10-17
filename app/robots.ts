import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Auth/transactional/API surfaces shouldn't be indexed.
            disallow: ["/dashboard", "/api/", "/checkout", "/v1/"],
        },
        sitemap: "https://payouts.elixpo.com/sitemap.xml",
        host: "https://payouts.elixpo.com",
    };
}
