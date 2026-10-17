export function normalizeOAuthAudience(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const audience = value.trim().toLowerCase();
    if (!audience || audience.length > 253 || audience.includes("/")) {
        return null;
    }
    try {
        const url = new URL(`https://${audience}`);
        if (
            url.host !== audience ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            return null;
        }
        return audience;
    } catch {
        return null;
    }
}
