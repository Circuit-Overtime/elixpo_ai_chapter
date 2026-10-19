export const runtime = "edge";

import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import {
    articleImageVariants,
    blogExcerpt,
    blogSearchDescription,
    safeJsonLd,
} from "../../src/utils/seoContent";
import { getCloudinaryUrl } from "../../lib/cloudinary";
import CatchAllClient from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-blog SEO: shared links pick up the blog's cover (if set) + title/author,
// otherwise a dynamic GitHub-style card from /api/og.
const httpImg = (u) =>
    typeof u === "string" && /^https?:\/\//.test(u) ? u : "";

// Metadata, JSON-LD and the page all need the same route resolution. React's
// request cache keeps that to one lookup without persisting member-aware data
// between visitors. Invoke the route handler in-process: a Worker self-fetch adds
// a full network round trip and JSON boundary before any metadata can stream.
const resolvePublicPage = cache(
    async (origin, name, slug = "", collection = "") => {
        const qs = new URLSearchParams({ name });
        if (slug) qs.set("slug", slug);
        if (collection) qs.set("collection", collection);
        const { GET: resolveRequest } = await import("../api/resolve/route");
        const response = await resolveRequest(new Request(`${origin}/api/resolve?${qs}`, {
            headers: { "user-agent": "lixblogs-ssr" },
        }));
        if (response.status === 404) return { type: "notFound" };
        if (!response.ok)
            throw new Error(
                `Public page resolution failed (${response.status})`,
            );
        return response.json();
    },
);

const resolvePublicReadingList = cache(async (origin, username, slug) => {
    const { GET: resolveCollection } = await import("../api/library/public/route");
    const response = await resolveCollection(new Request(
        `${origin}/api/library/public?${new URLSearchParams({ username, slug })}`,
    ));
    if (response.status === 404) return { type: "notFound" };
    if (!response.ok) throw new Error(`Curated collection resolution failed (${response.status})`);
    return { type: "readingList", ...(await response.json()) };
});

// Profile and organization banners are stored as Cloudinary public IDs. Build a
// delivery URL directly so an OG render does not have to follow our media redirect.
function seoMediaUrl(value, version, transforms = "f_jpg,q_auto:eco") {
    if (!value || typeof value !== "string") return "";
    if (/^https?:\/\//.test(value)) {
        if (!version) return value;
        const separator = value.includes("?") ? "&" : "?";
        return `${value}${separator}v=${encodeURIComponent(version)}`;
    }
    try {
        const url = getCloudinaryUrl(value, transforms);
        if (!/^https?:\/\//.test(url) || url.includes("undefined")) return "";
        return version ? `${url}?v=${encodeURIComponent(version)}` : url;
    } catch {
        return "";
    }
}

// `title.absolute` opts out of the root layout's "%s | LixBlogs" template. These
// titles already carry the brand, and without this they render double-branded:
// "Ankit Dey | LixBlogs Author Profile | LixBlogs".
function cardMeta({ title, description, url, og, ogType = "website" }) {
    return {
        title: { absolute: title },
        description,
        alternates: { canonical: url },
        openGraph: {
            type: ogType,
            title,
            description,
            url,
            siteName: "LixBlogs",
            images: [
                {
                    url: og,
                    secureUrl: og,
                    type: "image/png",
                    width: 1200,
                    height: 630,
                    alt: title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [og],
        },
    };
}

// Search engines cut descriptions around 155-160 chars. Build from the most specific
// signal available and fall back to something that still describes the page, rather
// than "@handle on LixBlogs", which tells a reader nothing and wastes the snippet.
function describe(parts, max = 160) {
    const s = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    // Cut on a word boundary so the snippet doesn't end mid-word.
    return `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function generateMetadata({ params, searchParams }) {
    const { path } = await params;
    const sp = searchParams ? await searchParams : {};
    const name = (path?.[0] || "").toLowerCase();
    const len = path?.length || 0;
    const slug =
        len === 2
            ? (path[1] || "").toLowerCase()
            : len === 3
              ? (path[2] || "").toLowerCase()
              : "";
    const collection = len === 3 ? (path[1] || "").toLowerCase() : "";
    const isInvite = !!sp.invite;

    if (!name) return {};

    try {
        const h = await headers();
        const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
        const ogUrl = (p) => `${origin}/api/og?${new URLSearchParams(p)}`;
        // Member+ authors/owners get unbranded share cards.
        const noBrand = (tier) =>
            tier && tier !== "free" ? { brand: "0" } : {};

        // Blog card. /api/resolve already strips every author field from a secret blog,
        // so the byline, avatar and tier hint would fall away on their own — but assert
        // it explicitly here too. A share card is the one artifact that outlives the page,
        // and it must never carry the author of an anonymous post.
        const blogMeta = (b, url) => {
            const secret = !!b.secret;
            const title = b.title || "Untitled";
            const primary = secret
                ? ""
                : b.author_name || b.author_username || "";
            const coAuthors = secret
                ? []
                : (b.co_authors || [])
                      .map((c) => c.display_name || c.username)
                      .filter(Boolean);
            const authorList = [primary, ...coAuthors].filter(Boolean);
            const sub = authorList.length
                ? `by ${authorList.slice(0, 4).join(", ")}${authorList.length > 4 ? ` +${authorList.length - 4}` : ""}`
                : "";
            const readTime = b.read_time_minutes
                ? `${b.read_time_minutes} min read`
                : "";
            // Prefer the author's own subtitle, then the generated excerpt, and only then
            // a synthesised line. Append the facts that help a reader decide to click:
            // who wrote it, how long it takes, what it covers.
            const byline = secret
                ? "Published anonymously on LixBlogs."
                : primary
                  ? `By ${primary} on LixBlogs.`
                  : "Published on LixBlogs.";
            // Google primarily generates snippets from visible article text and may
            // use this meta description when it is the clearer summary. Keep the
            // limited space about the article; authorship and dates have dedicated
            // metadata and structured-data fields.
            const description = blogSearchDescription(b) || describe([byline, readTime ? `${readTime}.` : ""]);
            const og = ogUrl({
                v: b.updated_at || b.published_at || "1",
                type: "blog",
                title,
                subtitle: b.subtitle || "",
                sub,
                readTime,
                cover: seoMediaUrl(b.cover_image_r2_key, b.updated_at, "f_jpg,q_auto:eco,w_1200,c_limit"),
                seed: b.id || b.slugid || b.slug || title,
                avatar: secret ? "" : seoMediaUrl(b.author_avatar, b.updated_at, "f_jpg,q_auto:eco,w_256,h_256,c_fill,g_face"),
                // author_tier is itself a weak author signal — never send it for a secret blog.
                ...(secret ? {} : noBrand(b.author_tier)),
            });
            return {
                title,
                description,
                authors: secret
                    ? undefined
                    : [
                          ...(b.author_username
                              ? [
                                    {
                                        name: primary,
                                        url: `${url.split("/").slice(0, 3).join("/")}/${b.author_username}`,
                                    },
                                ]
                              : []),
                          ...(b.co_authors || [])
                              .filter((author) => author.username)
                              .map((author) => ({
                                  name: author.display_name || author.username,
                                  url: `${url.split("/").slice(0, 3).join("/")}/${author.username}`,
                              })),
                      ],
                alternates: { canonical: url },
                // Keep secret blogs out of search engines: an indexed anonymous post is a
                // permanent, crawlable artifact its author can never fully retract.
                // Historical revision views (?rev=) are never indexed on their own.
                ...(secret || b.status !== "published" || sp.rev
                    ? { robots: { index: false, follow: false } }
                    : {}),
                openGraph: {
                    type: "article",
                    title,
                    description,
                    url,
                    siteName: "LixBlogs",
                    publishedTime: b.published_at
                        ? new Date(b.published_at * 1000).toISOString()
                        : undefined,
                    modifiedTime: b.updated_at
                        ? new Date(b.updated_at * 1000).toISOString()
                        : undefined,
                    authors: authorList.length ? authorList : undefined,
                    tags: (b.tags || []).length ? b.tags : undefined,
                    images: [
                        {
                            url: og,
                            secureUrl: og,
                            type: "image/png",
                            width: 1200,
                            height: 630,
                            alt: title,
                        },
                    ],
                },
                twitter: {
                    card: "summary_large_image",
                    title,
                    description,
                    images: [og],
                },
            };
        };

        // ── 1-segment: user or org profile ──
        if (!slug) {
            const data = await resolvePublicPage(origin, name);
            if (!data) return {};
            const url = `${origin}/${name}`;

            if (data.type === "user" && data.user) {
                const dn = data.user.display_name || data.user.username || name;
                const handle = `@${data.user.username || name}`;
                const posts = (data.blogs || []).length;
                const followers = data.user.followers || 0;
                // Lead with the bio when there is one, then add the facts a reader scanning
                // results actually wants: who this is, what they publish, how much of it.
                const stats = [
                    posts
                        ? plural(posts, "published post", "published posts")
                        : "",
                    followers ? plural(followers, "follower", "followers") : "",
                ]
                    .filter(Boolean)
                    .join(", ");
                const description = describe([
                    data.user.designation,
                    data.user.bio,
                    data.user.bio
                        ? `Read ${dn} (${handle}) on LixBlogs.`
                        : `${dn} (${handle}) writes and publishes on LixBlogs.`,
                    stats ? `${stats}.` : "",
                ]);
                const og = ogUrl({
                    v: data.user.updated_at || "1",
                    type: "profile",
                    kind: "Author Profile",
                    title: dn,
                    sub: handle,
                    subtitle: data.user.designation || data.user.bio || "",
                    avatar: seoMediaUrl(data.user.avatar_url || data.user.avatar_r2_key, data.user.updated_at, "f_jpg,q_auto:eco,w_256,h_256,c_fill,g_face"),
                    banner: seoMediaUrl(data.user.banner_r2_key, data.user.updated_at, "f_jpg,q_auto:eco,w_1200,h_630,c_fill"),
                    seed: data.user.username || name,
                    ...noBrand(data.user.tier),
                });
                return cardMeta({
                    title: `${dn} (${handle}), Author on LixBlogs`,
                    description,
                    url,
                    og,
                    ogType: "profile",
                });
            }
            if (data.type === "org" && data.org) {
                const dn = data.org.name || name;
                const handle = `@${data.org.slug || name}`;
                const ownerName =
                    data.owner?.display_name || data.owner?.username || "";
                const members = (data.members || []).length;
                const posts = (data.blogs || []).length;
                const stats = [
                    posts
                        ? plural(posts, "published post", "published posts")
                        : "",
                    members ? plural(members, "member", "members") : "",
                ]
                    .filter(Boolean)
                    .join(", ");
                const description = describe([
                    data.org.tagline,
                    data.org.description || data.org.bio,
                    `${dn} (${handle}) publishes on LixBlogs.`,
                    ownerName ? `Run by ${ownerName}.` : "",
                    stats ? `${stats}.` : "",
                ]);
                const og = ogUrl({
                    v: data.org.updated_at || "1",
                    type: "profile",
                    kind: "Organisation",
                    title: dn,
                    sub: ownerName ? `by ${ownerName}` : handle,
                    subtitle: data.org.tagline || data.org.description || data.org.bio || "",
                    avatar: seoMediaUrl(data.org.logo_url || data.org.logo_r2_key, data.org.updated_at, "f_jpg,q_auto:eco,w_256,h_256,c_fill"),
                    banner: seoMediaUrl(data.org.banner_url || data.org.banner_r2_key, data.org.updated_at, "f_jpg,q_auto:eco,w_1200,h_630,c_fill"),
                    seed: data.org.slug || name,
                    ...noBrand(data.owner?.tier),
                });
                return cardMeta({
                    title: `${dn} (${handle}), Organisation on LixBlogs`,
                    description,
                    url,
                    og,
                    ogType: "profile",
                });
            }
            // Short link /[slugid] — resolve falls back to a blog when the name matches no
            // namespace. This is the only path that serves a secret blog.
            if (data.type === "blog" && data.blog) {
                return blogMeta(data.blog, url);
            }
            return {};
        }

        if (collection === "reads" && slug) {
            const data = await resolvePublicReadingList(origin, name, slug);
            if (!data || data.type === "notFound") return {};
            const url = `${origin}/${path.join("/")}`;
            const title = data.list?.name || "Curated collection";
            const owner = data.owner?.display_name || data.owner?.username || name;
            const description = describe([
                data.list?.description,
                `${title} is curated by ${owner} on LixBlogs.`,
                (data.blogs || []).length ? `${plural(data.blogs.length, "post", "posts")} with original author attribution.` : "",
            ]);
            const og = ogUrl({
                v: data.list?.updated_at || "1",
                type: "collection",
                kind: "Curated collection",
                title,
                sub: `by ${owner}`,
                subtitle: data.list?.description || "",
                avatar: seoMediaUrl(data.owner?.avatar_url, data.list?.updated_at, "f_jpg,q_auto:eco,w_256,h_256,c_fill,g_face"),
                banner: seoMediaUrl(data.list?.cover_url, data.list?.updated_at, "f_jpg,q_auto:eco,w_1200,h_630,c_fill"),
                seed: data.list?.id || slug,
            });
            return cardMeta({ title: `${title}, curated by ${owner} on LixBlogs`, description, url, og });
        }

        // ── 2/3-segment: blog, collection, or a blog invite link ──
        const data = await resolvePublicPage(origin, name, slug, collection);
        if (!data) return {};
        const url = `${origin}/${path.join("/")}`;

        // Collection → org-branded card (org avatar + collection name + org name).
        if (data.type === "collection" && data.collection) {
            const orgName = data.owner?.name || name;
            const title = data.collection.name || "Collection";
            const posts = (data.blogs || []).length;
            const description = describe([
                data.collection.description,
                `${title} is a collection of posts by ${orgName} on LixBlogs.`,
                posts
                    ? `${plural(posts, "post", "posts")} in this series.`
                    : "",
            ]);
            const og = ogUrl({
                v: data.collection.updated_at || data.owner?.updated_at || "1",
                type: "collection",
                kind: "Collection",
                title,
                sub: orgName,
                subtitle: data.collection.description || "",
                avatar: seoMediaUrl(data.owner?.logo_url || data.owner?.logo_r2_key, data.owner?.updated_at, "f_jpg,q_auto:eco,w_256,h_256,c_fill"),
                banner: seoMediaUrl(data.owner?.banner_url || data.owner?.banner_r2_key, data.owner?.updated_at, "f_jpg,q_auto:eco,w_1200,h_630,c_fill"),
                seed: data.collection.slug || title,
                avatarSeed: data.owner?.slug || name,
            });
            return cardMeta({
                title: `${title}, a collection by ${orgName} on LixBlogs`,
                description,
                url,
                og,
                ogType: "website",
            });
        }

        if (data.type !== "blog" || !data.blog) return {};
        const b = data.blog;

        // Blog invite link (?invite=) → show who's inviting (org or author).
        if (isInvite) {
            const ownerIsOrg = data.owner?.type === "org";
            const inviterName = ownerIsOrg
                ? data.owner.name || ""
                : data.owner?.display_name ||
                  data.owner?.username ||
                  b.author_name ||
                  "";
            const avatar = httpImg(
                ownerIsOrg
                    ? data.owner.logo_url || data.owner.logo_r2_key
                    : data.owner?.avatar_url || b.author_avatar,
            );
            const title = inviterName || "LixBlogs";
            const description = `You're invited to collaborate on "${b.title || "a post"}".`;
            const og = ogUrl({
                v: b.updated_at || "1",
                type: "profile",
                kind: "Invitation to collaborate",
                title,
                sub: `on "${(b.title || "a post").slice(0, 50)}"`,
                avatar,
            });
            return {
                ...cardMeta({
                    title: `Invitation · ${title}`,
                    description,
                    url,
                    og,
                    ogType: "website",
                }),
                robots: { index: false, follow: false },
            };
        }

        // Normal blog → mark + title + author list (small). Secret blogs never reach
        // here — resolve 404s them on author-namespaced paths — but blogMeta is
        // secret-safe regardless.
        return blogMeta(b, url);
    } catch {
        return {};
    }
}

// Structured data for rich results. Emitted server-side so crawlers get it without
// running JS. resolvePublicPage shares the route lookup with metadata and rendering.
//
// Secret posts get NO structured data at all. They're already noindex, and JSON-LD
// exists to describe authorship — exactly what an anonymous post must never publish.
async function buildJsonLd(path, origin) {
    const name = (path?.[0] || "").toLowerCase();
    const len = path?.length || 0;
    if (!name) return null;
    const slug =
        len === 2
            ? (path[1] || "").toLowerCase()
            : len === 3
              ? (path[2] || "").toLowerCase()
              : "";
    const collection = len === 3 ? (path[1] || "").toLowerCase() : "";

    const img = (u) =>
        typeof u === "string" && /^https?:\/\//.test(u) ? u : undefined;
    const crumb = (items) => ({
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: it.name,
            item: it.url,
        })),
    });

    try {
        if (collection === "reads" && slug) {
            const data = await resolvePublicReadingList(origin, name, slug);
            if (!data || data.type === "notFound") return null;
            const url = `${origin}/${path.join("/")}`;
            return {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "@id": `${url}#collection`,
                url,
                name: data.list?.name || "Curated collection",
                description: data.list?.description || undefined,
                creator: {
                    "@type": "Person",
                    name: data.owner?.display_name || data.owner?.username,
                    url: `${origin}/${data.owner?.username || name}`,
                },
                hasPart: (data.blogs || []).map((blog) => ({
                    "@type": "BlogPosting",
                    "@id": `${origin}${blog.canonicalUrl}#post`,
                    url: `${origin}${blog.canonicalUrl}`,
                    headline: blog.title || "Untitled",
                    author: { "@type": "Person", name: blog.author?.displayName || blog.author_name },
                    license: blog.license || "all-rights-reserved",
                })),
                isPartOf: { "@id": `${origin}/#website` },
            };
        }
        const data = await resolvePublicPage(origin, name, slug, collection);
        if (!data) return null;

        if (data.type === "user" && data.user) {
            const u = data.user;
            const dn = u.display_name || u.username || name;
            const url = `${origin}/${name}`;
            const profileStories = (data.blogs || []).slice(0, 20).map((blog) => {
                const owner = blog.org_slug || blog.author_username || name;
                const parts = [owner];
                if (blog.org_slug && blog.collection_slug)
                    parts.push(blog.collection_slug);
                parts.push(blog.slug);
                return {
                    "@type": "BlogPosting",
                    "@id": `${origin}/${parts.map(encodeURIComponent).join("/")}#article`,
                    url: `${origin}/${parts.map(encodeURIComponent).join("/")}`,
                    headline: blog.title || "Untitled",
                };
            });
            return {
                "@context": "https://schema.org",
                "@graph": [
                    {
                        "@type": "ProfilePage",
                        "@id": `${url}#profile`,
                        url,
                        name: `${dn} on LixBlogs`,
                        mainEntity: { "@id": `${url}#person` },
                        isPartOf: { "@id": `${origin}/#website` },
                        hasPart: profileStories.length
                            ? profileStories
                            : undefined,
                    },
                    {
                        "@type": "Person",
                        "@id": `${url}#person`,
                        name: dn,
                        alternateName: u.username
                            ? `@${u.username}`
                            : undefined,
                        description: u.bio || undefined,
                        image: [
                            img(u.avatar_url),
                            u.banner_r2_key
                                ? img(`/api/media/${u.banner_r2_key}`)
                                : undefined,
                        ].filter(Boolean),
                        url,
                        jobTitle: u.designation || undefined,
                        sameAs: (() => {
                            const links = [u.website];
                            try {
                                const parsed = JSON.parse(u.links || "[]");
                                if (Array.isArray(parsed))
                                    parsed.forEach((l) => {
                                        if (l.url) links.push(l.url);
                                    });
                            } catch {}
                            return links.filter(Boolean).length
                                ? links.filter(Boolean)
                                : undefined;
                        })(),
                    },
                ],
            };
        }

        if (data.type === "org" && data.org) {
            const o = data.org;
            const url = `${origin}/${name}`;
            return {
                "@context": "https://schema.org",
                "@type": "Organization",
                "@id": `${url}#org`,
                name: o.name || name,
                alternateName: o.slug ? `@${o.slug}` : undefined,
                slogan: o.tagline || undefined,
                description: describe([o.tagline, o.description || o.bio]) || undefined,
                logo: img(o.logo_url || o.logo_r2_key),
                url,
                sameAs: o.website ? [o.website] : undefined,
            };
        }

        if (data.type === "blog" && data.blog) {
            const b = data.blog;
            if (b.secret) return null; // never describe the authorship of an anonymous post
            const url = `${origin}/${path.join("/")}`;
            const authors = [
                {
                    name: b.author_name || b.author_username,
                    username: b.author_username,
                    designation: b.author_designation,
                },
                ...(b.co_authors || []).map((c) => ({
                    name: c.display_name || c.username,
                    username: c.username,
                    designation: c.designation,
                })),
            ].filter((author) => author.name);
            const orgOwner = data.owner?.type === "org" ? data.owner : null;
            const fallbackImage = `${origin}/api/og?${new URLSearchParams({ type: "blog", title: b.title || "Untitled", seed: b.id || b.slugid || b.slug || url })}`;
            const articleSummary = blogSearchDescription(b, 240) || blogExcerpt(b, 240);
            const coverImage = seoMediaUrl(
                b.cover_image_r2_key,
                b.updated_at,
                "",
            );
            const images = articleImageVariants(coverImage || fallbackImage);
            return {
                "@context": "https://schema.org",
                "@graph": [
                    {
                        "@type": "BlogPosting",
                        "@id": `${url}#post`,
                        url,
                        name: b.title || "Untitled",
                        headline: b.title || "Untitled",
                        alternativeHeadline: b.subtitle || undefined,
                        description: articleSummary || undefined,
                        abstract: articleSummary || undefined,
                        // The generated OG card is also the stable default image when a post
                        // has no uploaded cover, so every indexed post has an image.
                        image: images,
                        datePublished: b.published_at
                            ? new Date(b.published_at * 1000).toISOString()
                            : undefined,
                        dateModified: b.updated_at
                            ? new Date(b.updated_at * 1000).toISOString()
                            : undefined,
                        author: authors.map((author) => ({
                            "@type": "Person",
                            "@id": author.username
                                ? `${origin}/${author.username}#person`
                                : undefined,
                            name: author.name,
                            jobTitle: author.designation || undefined,
                            url: author.username
                                ? `${origin}/${author.username}`
                                : undefined,
                        })),
                        publisher: orgOwner
                            ? {
                                  "@type": "Organization",
                                  "@id": `${origin}/${orgOwner.slug || name}#org`,
                                  name: orgOwner.name,
                                  slogan: orgOwner.tagline || undefined,
                                  url: `${origin}/${orgOwner.slug || name}`,
                                  logo: seoMediaUrl(
                                      orgOwner.logo_url || orgOwner.logo_r2_key,
                                      orgOwner.updated_at,
                                      "f_png,q_auto,w_512,h_512,c_fit",
                                  ) || undefined,
                              }
                            : { "@id": `${origin}/#organization` },
                        keywords: (b.tags || []).length
                            ? b.tags.join(", ")
                            : undefined,
                        articleSection: (b.tags || []).length
                            ? b.tags[0]
                            : undefined,
                        about: (b.tags || []).length
                            ? b.tags.map((tag) => ({
                                  "@type": "Thing",
                                  name: tag,
                                  url: `${origin}/tag/${encodeURIComponent(tag)}`,
                              }))
                            : undefined,
                        timeRequired: b.read_time_minutes
                            ? `PT${b.read_time_minutes}M`
                            : undefined,
                        inLanguage: "en",
                        mainEntityOfPage: { "@type": "WebPage", "@id": url },
                        isPartOf: { "@id": `${origin}/#blog` },
                        isAccessibleForFree: !b.member_only,
                        ...(b.member_only
                            ? {
                                  hasPart: {
                                      "@type": "WebPageElement",
                                      isAccessibleForFree: false,
                                      cssSelector: ".blog-preview-content",
                                  },
                              }
                            : {}),
                    },
                    crumb([
                        { name: "LixBlogs", url: origin },
                        {
                            name: data.owner?.name || b.author_name || name,
                            url: `${origin}/${name}`,
                        },
                        { name: b.title || "Post", url },
                    ]),
                ],
            };
        }

        if (data.type === "collection" && data.collection) {
            const url = `${origin}/${path.join("/")}`;
            return {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "@id": `${url}#collection`,
                url,
                name: data.collection.name || "Collection",
                description: data.collection.description || undefined,
                isPartOf: { "@id": `${origin}/#website` },
            };
        }
        return null;
    } catch {
        return null; // structured data is an enhancement; never break the page for it
    }
}

export default async function CatchAllHandle({ params }) {
    const { path } = await params;
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
    const rawName = path?.[0] || "";
    const slug =
        path?.length === 2
            ? (path[1] || "").toLowerCase()
            : path?.length === 3
              ? (path[2] || "").toLowerCase()
              : "";
    const collection = path?.length === 3 ? (path[1] || "").toLowerCase() : "";
    const isReadingList =
        path?.length === 3 && (path[1] || "").toLowerCase() === "reads";
    const resolvedData = await (isReadingList
        ? resolvePublicReadingList(origin, rawName.toLowerCase(), slug)
        : resolvePublicPage(origin, rawName.toLowerCase(), slug, collection)
    ).catch(() => null);
    const initialData = resolvedData;
    if (initialData?.type === "notFound" && !isReadingList) notFound();
    const jsonLd =
        initialData && initialData.type !== "notFound"
            ? await buildJsonLd(path, origin)
            : null;

    if (initialData?.type === "redirect" && initialData.location) {
        permanentRedirect(initialData.location);
    }

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
                />
            )}
            <CatchAllClient params={params} initialData={initialData} />
        </>
    );
}
