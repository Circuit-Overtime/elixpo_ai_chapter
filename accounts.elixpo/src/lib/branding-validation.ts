const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function sanitizeString(value: string): string {
    return Array.from(value)
        .filter((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return (
                character !== "<" &&
                character !== ">" &&
                codePoint > 31 &&
                codePoint !== 127
            );
        })
        .join("")
        .trim();
}

function isLoopbackHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "[::1]" ||
        host.endsWith(".localhost")
    );
}

export function isPublicBrandHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (
        isLoopbackHost(host) ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
        host.includes(":")
    ) {
        return false;
    }

    const labels = host.split(".");
    return (
        labels.length >= 2 &&
        labels.every((label) => DOMAIN_LABEL_REGEX.test(label))
    );
}

export function isValidUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        if (url.username || url.password) return false;
        if (url.protocol === "https:") return true;
        return (
            url.protocol === "http:" &&
            process.env.NODE_ENV !== "production" &&
            isLoopbackHost(url.hostname)
        );
    } catch {
        return false;
    }
}

export function getBrandDomain(homepageUrl: string): string | null {
    try {
        const url = new URL(homepageUrl);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !isPublicBrandHostname(url.hostname)
        ) {
            return null;
        }
        return url.hostname.toLowerCase().replace(/\.$/, "");
    } catch {
        return null;
    }
}

export function isSameOrSubdomain(
    hostname: string,
    verifiedDomain: string,
): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    const domain = verifiedDomain.toLowerCase().replace(/\.$/, "");
    return host === domain || host.endsWith(`.${domain}`);
}

export function validateRedirectDomains(
    homepageUrl: string,
    redirectUris: string[],
): boolean {
    const verifiedDomain = getBrandDomain(homepageUrl);
    if (!verifiedDomain) return false;

    return redirectUris.every((uri) => {
        try {
            const redirect = new URL(uri);
            return (
                (redirect.protocol === "https:" ||
                    (process.env.NODE_ENV !== "production" &&
                        redirect.protocol === "http:" &&
                        isLoopbackHost(redirect.hostname))) &&
                isSameOrSubdomain(redirect.hostname, verifiedDomain)
            );
        } catch {
            return false;
        }
    });
}

export function validateBrandAssetUrl(
    urlString: string,
    homepageUrl: string,
): { valid: boolean; error?: string } {
    const verifiedDomain = getBrandDomain(homepageUrl);
    if (!verifiedDomain) {
        return { valid: false, error: "Verify a public HTTPS homepage first" };
    }

    try {
        const url = new URL(urlString);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !isSameOrSubdomain(url.hostname, verifiedDomain)
        ) {
            return {
                valid: false,
                error: `URL must use HTTPS on ${verifiedDomain} or one of its subdomains`,
            };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: "Invalid URL" };
    }
}

export function validateLogoUrl(
    urlString: string,
    homepageUrl: string,
): { valid: boolean; error?: string } {
    return validateBrandAssetUrl(urlString, homepageUrl);
}

export function hexToRgb(
    hex: string,
): { r: number; g: number; b: number } | null {
    if (!HEX_COLOR_REGEX.test(hex)) return null;

    let normalized = hex.slice(1);
    if (normalized.length === 3) {
        normalized = normalized
            .split("")
            .map((character) => character + character)
            .join("");
    }

    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
    };
}

export function getRelativeLuminance(r: number, g: number, b: number): number {
    const [red, green, blue] = [r, g, b].map((component) => {
        const value = component / 255;
        return value <= 0.03928
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(first: string, second: string): number {
    const firstRgb = hexToRgb(first);
    const secondRgb = hexToRgb(second);
    if (!firstRgb || !secondRgb) return 1;

    const firstLuminance = getRelativeLuminance(
        firstRgb.r,
        firstRgb.g,
        firstRgb.b,
    );
    const secondLuminance = getRelativeLuminance(
        secondRgb.r,
        secondRgb.g,
        secondRgb.b,
    );
    return (
        (Math.max(firstLuminance, secondLuminance) + 0.05) /
        (Math.min(firstLuminance, secondLuminance) + 0.05)
    );
}

export function getContrastColor(background: string): string {
    return getContrastRatio(background, "#FFFFFF") >=
        getContrastRatio(background, "#000000")
        ? "#FFFFFF"
        : "#000000";
}

export function hasSufficientContrast(color: string): boolean {
    if (!HEX_COLOR_REGEX.test(color)) return false;
    const foreground = getContrastColor(color);
    return getContrastRatio(color, foreground) >= 4.5;
}

export function isOpaqueHexColor(color: string): boolean {
    return HEX_COLOR_REGEX.test(color);
}
