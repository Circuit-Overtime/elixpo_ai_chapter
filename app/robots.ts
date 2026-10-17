import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Auth/transactional/API surfaces shouldn't be indexed.
            disallow: ["/dashboard", "/api/", "/v1/"],
        },
        sitemap: "https://mail.elixpo.com/sitemap.xml",
        host: "https://mail.elixpo.com",
    };
}
