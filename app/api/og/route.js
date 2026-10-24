import { ImageResponse } from "next/og";
import {
    generateBlogBanner,
    generatePixelAvatar,
    generateProfileBanner,
} from "../../../src/utils/pixelAvatar";
import { LIX_LOGO } from "./lixLogo";

export const runtime = "edge";

const OG_RESPONSE_OPTIONS = {
    width: 1200,
    height: 630,
    headers: {
        // Metadata appends the entity's updated_at value to media and card URLs.
        // A changed profile/blog therefore gets a new cache key; unchanged cards
        // can safely stay at the edge instead of rerendering for every crawler.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=2592000, immutable",
        "CDN-Cache-Control": "public, max-age=31536000, stale-while-revalidate=2592000, immutable",
        "X-Content-Type-Options": "nosniff",
    },
};

const OG_RETRY_RESPONSE_OPTIONS = {
    width: 1200,
    height: 630,
    headers: {
        // A deterministic fallback is still a complete card, but keep its cache
        // short so a temporarily slow origin image is retried on the next crawl.
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
        "CDN-Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
    },
};

const REMOTE_IMAGE_TIMEOUT_MS = 1200;
const REMOTE_IMAGE_MAX_BYTES = 1_750_000;

function base64FromBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

function publicHttpsUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) return false;
        const host = url.hostname.toLowerCase();
        if (host === "localhost" || host.endsWith(".local")) return false;

        const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipv4) {
            const [, first, second] = ipv4.map(Number);
            if (
                first === 0
                || first === 10
                || first === 127
                || (first === 169 && second === 254)
                || (first === 172 && second >= 16 && second <= 31)
                || (first === 192 && second === 168)
            ) return false;
        }

        const ipv6 = host.replace(/^\[|\]$/g, "");
        if (ipv6 === "::1" || ipv6.startsWith("fc") || ipv6.startsWith("fd") || ipv6.startsWith("fe80:")) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

// Satori otherwise performs its own unbounded remote fetch while rendering. Resolve
// media concurrently, reuse Cloudflare's fetch cache, and embed supported bytes. A
// slow, oversized, or unsupported image falls back to local deterministic SVG art,
// so the social card itself is never lost because an upstream image is unavailable.
async function resolveRemoteImage(url) {
    if (!url || !publicHttpsUrl(url)) return { src: "", loaded: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: "force-cache",
            headers: { Accept: "image/jpeg,image/png" },
            cf: { cacheEverything: true, cacheTtl: 2_592_000 },
        });
        if (!response.ok) return { src: "", loaded: false };
        const responseType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
        const contentType = responseType === "image/jpg" ? "image/jpeg" : responseType;
        if (!new Set(["image/jpeg", "image/png"]).has(contentType)) return { src: "", loaded: false };
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > REMOTE_IMAGE_MAX_BYTES) return { src: "", loaded: false };
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > REMOTE_IMAGE_MAX_BYTES) return { src: "", loaded: false };
        return { src: `data:${contentType};base64,${base64FromBytes(bytes)}`, loaded: true };
    } catch {
        return { src: "", loaded: false };
    } finally {
        clearTimeout(timer);
    }
}

// GitHub-style social cards on a clean white background.
//   type=profile    → real logo + avatar + name + @handle + bio (users & orgs)
//   type=collection → collection name + owning publication + description
//   type=blog       → real logo + blog banner + title + tagline + read time · authors
//
// Params: type, title, subtitle, sub, kind, avatar, cover, banner, seed, avatarSeed, readTime
//   subtitle — bio (profile) or tagline (blog)
//   sub      — @handle (profile) or author list (blog)
//   kind     — small badge ("Author Profile", "Organisation", "Collection", …)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "blog";
    const title = (searchParams.get("title") || "Untitled").slice(0, 120);
    const subtitle = (searchParams.get("subtitle") || "").slice(0, 220);
    const sub = (searchParams.get("sub") || "").slice(0, 140);
    const kind = (searchParams.get("kind") || "").slice(0, 40);
    const readTime = (searchParams.get("readTime") || "").slice(0, 20);
    // Member+ perk: share cards drop the LixBlogs brand. Callers pass brand=0 when
    // the author/owner is on a paid tier (resolved from their `tier` in /api/resolve).
    const showBrand = searchParams.get("brand") !== "0";

    // satori can't decode WebP — force Cloudinary to deliver JPEG.
    const ogSafeImage = (url, width) => {
        if (!url || !publicHttpsUrl(url)) return "";
        if (url.includes("res.cloudinary.com")) {
            let u = url.replace(/f_webp/g, "f_jpg").replace(/f_auto/g, "f_jpg");
            if (!/f_(jpg|png)/.test(u))
                u = u.replace("/upload/", "/upload/f_jpg/");
            if (width && !new RegExp(`w_${width}(?:[,/]|$)`).test(u)) {
                u = u.replace("/upload/", `/upload/f_jpg,q_auto:eco,w_${width},c_limit/`);
            }
            return u;
        }
        return url;
    };
    const requestedAvatar = ogSafeImage(searchParams.get("avatar") || "", 256);
    const requestedCover = ogSafeImage(searchParams.get("cover") || "", 1200);
    const requestedBanner = ogSafeImage(searchParams.get("banner") || "", 1200);
    const seed = (searchParams.get("seed") || title).slice(0, 160);
    const avatarSeed = (searchParams.get("avatarSeed") || seed).slice(0, 160);
    const defaultCover = generateBlogBanner(seed);
    // Deterministic fallbacks — zero network, instant.
    // Profile banner: when a real avatar exists but no banner, tint the
    // generated banner palette to the avatar URL hash so they visually match.
    const defaultBanner = generateProfileBanner(seed, requestedAvatar || undefined);
    const defaultAvatar = generatePixelAvatar(avatarSeed);

    const wantsAvatar = type === "profile" || type === "collection" || type === "blog";
    const wantsBanner = type === "profile" || type === "collection";
    const wantsCover = type === "blog";
    const [resolvedAvatar, resolvedBanner, resolvedCover] = await Promise.all([
        wantsAvatar ? resolveRemoteImage(requestedAvatar) : { src: "", loaded: false },
        wantsBanner ? resolveRemoteImage(requestedBanner) : { src: "", loaded: false },
        wantsCover ? resolveRemoteImage(requestedCover) : { src: "", loaded: false },
    ]);
    const avatar = resolvedAvatar.src;
    const banner = resolvedBanner.src;
    const cover = resolvedCover.src;
    const hasAvatar = resolvedAvatar.loaded;
    const hasBanner = resolvedBanner.loaded;
    const hasCover = resolvedCover.loaded;
    const remoteMediaFailed = Boolean(
        (wantsAvatar && requestedAvatar && !hasAvatar)
        || (wantsBanner && requestedBanner && !hasBanner)
        || (wantsCover && requestedCover && !hasCover),
    );
    const responseOptions = remoteMediaFailed ? OG_RETRY_RESPONSE_OPTIONS : OG_RESPONSE_OPTIONS;

    // Real LixBlogs logo, inlined as a data URI (see ./lixLogo). Inlining avoids a
    // request-time self-fetch, which is unreliable in the Cloudflare edge runtime
    // and was falling back to the drawn "L" in production.
    const logoSrc = LIX_LOGO;

    const INK = "#0d1117";
    const MUTED = "#57606a";
    const BORDER = "#d0d7de";
    const ACCENT = "#9b7bf7";

    const Brand = () => (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {logoSrc ? (
                <img
                    src={logoSrc}
                    width={36}
                    height={36}
                    style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                    }}
                />
            ) : (
                <div
                    style={{
                        display: "flex",
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${ACCENT}, #6d4fd1)`,
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "22px",
                        fontWeight: 800,
                    }}
                >
                    L
                </div>
            )}
            <span style={{ color: INK, fontSize: "28px", fontWeight: 700 }}>
                LixBlogs
            </span>
        </div>
    );

    // Brand slot — renders the LixBlogs mark, or an empty spacer that preserves the
    // surrounding space-between layout when branding is suppressed for paid tiers.
    const BrandSlot = () =>
        showBrand ? <Brand /> : <div style={{ display: "flex" }} />;

    const initial = (title || "L").replace("@", "").charAt(0).toUpperCase();

    // ── Collection — a distinct series card using the owning publication's media ──
    if (type === "collection") {
        const bannerSrc = hasBanner ? banner : defaultBanner;
        const avatarSrc = hasAvatar ? avatar : defaultAvatar;
        const avatarRadius = hasAvatar ? "50%" : "16px";

        return new ImageResponse(
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    background: "#ffffff",
                    fontFamily: "sans-serif",
                    padding: "64px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        width: "100%",
                        height: "100%",
                        border: `1px solid ${BORDER}`,
                        borderRadius: "28px",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            position: "relative",
                            display: "flex",
                            width: "40%",
                            height: "100%",
                            overflow: "hidden",
                            borderRight: `1px solid ${BORDER}`,
                        }}
                    >
                        <img
                            src={bannerSrc}
                            width={430}
                            height={500}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                left: "40px",
                                bottom: "40px",
                                display: "flex",
                                width: "120px",
                                height: "120px",
                                padding: "8px",
                                borderRadius: avatarRadius,
                                background: "#ffffff",
                                border: `1px solid ${BORDER}`,
                            }}
                        >
                            <img
                                src={avatarSrc}
                                width={102}
                                height={102}
                                style={{
                                    width: "102px",
                                    height: "102px",
                                    borderRadius: avatarRadius,
                                    objectFit: "cover",
                                }}
                            />
                        </div>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flex: 1,
                            flexDirection: "column",
                            justifyContent: "space-between",
                            padding: "42px 52px",
                        }}
                    >
                        <BrandSlot />
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    color: ACCENT,
                                    fontSize: "21px",
                                    fontWeight: 700,
                                    letterSpacing: "1.5px",
                                    textTransform: "uppercase",
                                    marginBottom: "14px",
                                }}
                            >
                                {kind || "Collection"}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    color: INK,
                                    fontSize: title.length > 28 ? "46px" : "56px",
                                    fontWeight: 800,
                                    lineHeight: 1.05,
                                }}
                            >
                                {title}
                            </div>
                            {sub ? (
                                <div
                                    style={{
                                        display: "flex",
                                        color: MUTED,
                                        fontSize: "25px",
                                        fontWeight: 600,
                                        marginTop: "14px",
                                    }}
                                >
                                    by {sub}
                                </div>
                            ) : null}
                            {subtitle ? (
                                <div
                                    style={{
                                        display: "flex",
                                        color: MUTED,
                                        fontSize: "22px",
                                        lineHeight: 1.4,
                                        marginTop: "18px",
                                    }}
                                >
                                    {subtitle}
                                </div>
                            ) : null}
                        </div>
                        <div style={{ display: "flex" }} />
                    </div>
                </div>
            </div>,
            responseOptions,
        );
    }

    // ── Profile / org — always banner + always avatar + name + handle + bio ──
    if (type === "profile") {
        // Banner: real URL when available, otherwise deterministic geometric art.
        const bannerSrc = hasBanner ? banner : defaultBanner;
        // Avatar: real URL when available, otherwise the geometric avatar.
        const avatarSrc = hasAvatar ? avatar : defaultAvatar;
        // The generated avatar is square — render it with a rounded-square clip.
        const avatarRadius = hasAvatar ? "50%" : "16px";

        return new ImageResponse(
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    background: "#ffffff",
                    fontFamily: "sans-serif",
                    padding: "72px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        height: "100%",
                        border: `1px solid ${BORDER}`,
                        borderRadius: "28px",
                        overflow: "hidden",
                    }}
                >
                    {/* Banner strip — always present */}
                    <div
                        style={{
                            display: "flex",
                            width: "100%",
                            height: "160px",
                            flexShrink: 0,
                        }}
                    >
                        <img
                            src={bannerSrc}
                            width={1056}
                            height={160}
                            style={{
                                width: "100%",
                                height: "160px",
                                objectFit: "cover",
                            }}
                        />
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            flex: 1,
                            padding: "32px 68px 40px",
                            justifyContent: "space-between",
                        }}
                    >
                        <BrandSlot />
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "44px",
                            }}
                        >
                            {/* Avatar — always present */}
                            <img
                                src={avatarSrc}
                                width={160}
                                height={160}
                                style={{
                                    width: "160px",
                                    height: "160px",
                                    borderRadius: avatarRadius,
                                    objectFit: "cover",
                                    border: `1px solid ${BORDER}`,
                                }}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    flex: 1,
                                    minWidth: 0,
                                }}
                            >
                                {kind ? (
                                    <div
                                        style={{
                                            display: "flex",
                                            color: ACCENT,
                                            fontSize: "22px",
                                            fontWeight: 700,
                                            letterSpacing: "1.5px",
                                            textTransform: "uppercase",
                                            marginBottom: "12px",
                                        }}
                                    >
                                        {kind}
                                    </div>
                                ) : null}
                                <div
                                    style={{
                                        display: "flex",
                                        color: INK,
                                        fontSize:
                                            title.length > 22 ? "54px" : "66px",
                                        fontWeight: 800,
                                        lineHeight: 1.05,
                                    }}
                                >
                                    {title}
                                </div>
                                {sub ? (
                                    <div
                                        style={{
                                            display: "flex",
                                            color: MUTED,
                                            fontSize: "28px",
                                            fontWeight: 600,
                                            marginTop: "12px",
                                        }}
                                    >
                                        {sub}
                                    </div>
                                ) : null}
                                {subtitle ? (
                                    <div
                                        style={{
                                            display: "flex",
                                            color: MUTED,
                                            fontSize: "24px",
                                            marginTop: "16px",
                                            lineHeight: 1.4,
                                            maxWidth: "700px",
                                        }}
                                    >
                                        {subtitle}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: "flex" }} />
                    </div>
                </div>
            </div>,
            responseOptions,
        );
    }

    // ── Blog — logo + banner + title + tagline + read time · authors ──
    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                background: "#ffffff",
                fontFamily: "sans-serif",
                padding: "64px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                    border: `1px solid ${BORDER}`,
                    borderRadius: "28px",
                    overflow: "hidden",
                }}
            >
                {/* Banner — cover if present, else a branded default */}
                <div
                    style={{ display: "flex", width: "100%", height: "230px" }}
                >
                    {hasCover ? (
                        <img
                            src={cover}
                            width={1072}
                            height={230}
                            style={{
                                width: "100%",
                                height: "230px",
                                objectFit: "cover",
                            }}
                        />
                    ) : (
                        <img
                            src={defaultCover}
                            width={1072}
                            height={230}
                            style={{
                                width: "100%",
                                height: "230px",
                                objectFit: "cover",
                            }}
                        />
                    )}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        padding: "40px 56px",
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <div
                            style={{
                                display: "flex",
                                color: INK,
                                fontSize: title.length > 52 ? "52px" : "64px",
                                fontWeight: 800,
                                lineHeight: 1.08,
                            }}
                        >
                            {title}
                        </div>
                        {subtitle ? (
                            <div
                                style={{
                                    display: "flex",
                                    color: MUTED,
                                    fontSize: "28px",
                                    marginTop: "16px",
                                    lineHeight: 1.3,
                                    maxWidth: "960px",
                                }}
                            >
                                {subtitle}
                            </div>
                        ) : null}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "14px",
                                color: MUTED,
                                fontSize: "24px",
                                fontWeight: 600,
                            }}
                        >
                            {hasAvatar ? (
                                <img
                                    src={avatar}
                                    width={44}
                                    height={44}
                                    style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "50%",
                                        objectFit: "cover",
                                        border: `1px solid ${BORDER}`,
                                    }}
                                />
                            ) : null}
                            <span style={{ display: "flex" }}>
                                {[readTime, sub].filter(Boolean).join("  ·  ")}
                            </span>
                        </div>
                        <BrandSlot />
                    </div>
                </div>
            </div>
        </div>,
        responseOptions,
    );
}
