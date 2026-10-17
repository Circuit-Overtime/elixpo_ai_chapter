import type { MetadataRoute } from "next";

const BASE = "https://mail.elixpo.com";

// path → priority. Marketing + docs are indexable; auth/dashboard/api/v1
// are excluded here and in robots.ts.
const ROUTES: Array<[string, number]> = [
    ["", 1],
    ["/pricing", 0.8],
    ["/docs", 0.8],
    ["/login", 0.4],
    ["/privacy", 0.3],
    ["/terms", 0.3],
    ["/content-policy", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return ROUTES.map(([path, priority]) => ({
        url: `${BASE}${path}`,
        lastModified,
        changeFrequency: path.startsWith("/docs") ? "weekly" : "monthly",
        priority,
    }));
}
