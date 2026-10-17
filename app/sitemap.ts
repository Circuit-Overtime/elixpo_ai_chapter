import type { MetadataRoute } from "next";

export const runtime = "edge";

const BASE_URL = "https://accounts.elixpo.com";

const PUBLIC_ROUTES = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs/quickstart", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs/lixaccounts", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs/oauth", priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs/users-api", priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs/webhooks", priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs/api-keys", priority: 0.7, changeFrequency: "monthly" },
    { path: "/docs/errors", priority: 0.6, changeFrequency: "monthly" },
    { path: "/docs/self-hosting", priority: 0.6, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
        url: `${BASE_URL}${path}`,
        priority,
        changeFrequency,
    }));
}
