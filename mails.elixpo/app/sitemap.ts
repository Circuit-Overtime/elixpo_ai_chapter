import { absoluteUrl } from "@/lib/seo";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// path → priority. Marketing + docs are indexable; auth/dashboard/api/v1
// are excluded here and in robots.ts.
const ROUTES: Array<[string, number]> = [
    ["", 1],
    ["/pricing", 0.8],
    ["/docs", 0.8],
    ["/docs/quickstart", 0.78],
    ["/docs/authentication", 0.72],
    ["/docs/templates", 0.72],
    ["/docs/triggering", 0.72],
    ["/docs/attachments", 0.65],
    ["/docs/unsubscribe", 0.65],
    ["/docs/logs", 0.62],
    ["/docs/deliverability", 0.76],
    ["/privacy", 0.3],
    ["/terms", 0.3],
    ["/content-policy", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = "2026-10-19";
    return ROUTES.map(([path, priority]) => ({
        url: absoluteUrl(path || "/"),
        lastModified,
        changeFrequency: path.startsWith("/docs") ? "weekly" : "monthly",
        priority,
    }));
}
