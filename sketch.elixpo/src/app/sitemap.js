import { blogPosts } from "@/content/blog";

export default async function sitemap() {
    const baseUrl = "https://sketch.elixpo.com";

    // Static routes
    const staticRoutes = [
        "",
        "/docs",
        "/pricing",
        "/teams",
        "/resources/blog",
        "/resources/community",
        "/resources/how-to-start",
        "/resources/npm-package",
        "/resources/security",
        "/resources/use-cases",
        "/resources/vscode-extension",
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date().toISOString().split("T")[0],
        changeFrequency: "weekly",
        priority: route === "" ? 1.0 : 0.8,
    }));

    // Dynamic blog routes
    const blogRoutes = blogPosts.map((post) => ({
        url: `${baseUrl}/docs/blog/${post.slug}`,
        lastModified: post.date,
        changeFrequency: "monthly",
        priority: 0.6,
    }));

    return [...staticRoutes, ...blogRoutes];
}
