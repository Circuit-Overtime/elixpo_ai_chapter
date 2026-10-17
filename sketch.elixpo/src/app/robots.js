export default function robots() {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: [
                "/c/", // Canvas rooms
                "/room/", // Collaborative rooms
                "/s/", // Share links
                "/profile/", // User profile
                "/api/", // API routes
            ],
        },
        sitemap: "https://sketch.elixpo.com/sitemap.xml",
    };
}
