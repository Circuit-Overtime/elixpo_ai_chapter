import { absoluteUrl } from "@/lib/seo";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/api/",
                    "/dashboard/",
                    "/workspace/",
                    "/join/",
                    "/login",
                    "/u/",
                    "/v1/",
                ],
            },
            {
                userAgent: "Googlebot",
                allow: "/",
                disallow: [
                    "/api/",
                    "/dashboard/",
                    "/workspace/",
                    "/join/",
                    "/login",
                    "/u/",
                    "/v1/",
                ],
            },
        ],
        sitemap: absoluteUrl("/sitemap.xml"),
        host: absoluteUrl("/"),
    };
}
