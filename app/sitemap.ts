import type { MetadataRoute } from "next";

const BASE = "https://payouts.elixpo.com";

// path → priority. Marketing + docs are indexable; auth/dashboard/api/checkout
// are excluded here and in robots.ts.
const ROUTES: Array<[string, number]> = [
    ["", 1],
    ["/pricing", 0.9],
    ["/about", 0.8],
    ["/docs", 0.8],
    ["/docs/quickstart", 0.7],
    ["/docs/catalog", 0.7],
    ["/docs/checkout", 0.7],
    ["/docs/webhooks", 0.7],
    ["/docs/entitlements", 0.7],
    ["/docs/payouts", 0.7],
    ["/privacy", 0.4],
    ["/terms", 0.4],
    ["/refunds", 0.4],
    ["/contact", 0.5],
    ["/login", 0.3],
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
