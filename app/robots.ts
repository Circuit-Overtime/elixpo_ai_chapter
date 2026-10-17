import type { MetadataRoute } from "next";

export const runtime = "edge";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/about", "/pricing", "/docs/", "/privacy", "/terms"],
            disallow: [
                "/api/",
                "/dashboard/",
                "/oauth/",
                "/mfa/",
                "/device",
                "/verify",
                "/setup-name",
                "/callback/",
            ],
        },
        sitemap: "https://accounts.elixpo.com/sitemap.xml",
        host: "https://accounts.elixpo.com",
    };
}
