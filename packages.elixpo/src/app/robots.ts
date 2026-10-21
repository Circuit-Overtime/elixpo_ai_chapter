import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/apt/"] },
      { userAgent: "Googlebot", allow: "/", disallow: ["/apt/"] },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
