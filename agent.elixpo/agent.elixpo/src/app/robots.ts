import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";


export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      { userAgent: ["Googlebot", "Bingbot"], allow: "/", disallow: ["/api/"] },
      { userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot"], allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
