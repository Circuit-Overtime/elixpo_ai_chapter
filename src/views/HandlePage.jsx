"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { STAFF_ORG_ID } from "../../lib/staff";
import AppShell from "../components/AppShell";
import AuthorAttribution from "../components/AuthorAttribution";
import BlogComments from "../components/BlogComments";
import BlogDotsMenu from "../components/BlogDotsMenu";
import { FollowToggle } from "../components/BlogFollowButtons";
import ReaderCompanion from "../components/ReaderCompanion";
import ReadingResumePrompt from "../components/ReadingResumePrompt";
import BlogInteractionBar from "../components/BlogInteractionBar";
import BlogInviteOverlay from "../components/BlogInviteOverlay";
import BlogRecommendations from "../components/BlogRecommendations";
import RevisionTimeline from "../components/RevisionTimeline";
import ContributionGraph from "../components/ContributionGraph";
import { CreatorBadgeMark } from "../components/CreatorBadge";
import FollowListModal from "../components/FollowListModal";
import { useAuth } from "../context/AuthContext";
import { normalizeImageUrl, normalizeUrl } from "../utils/linkHelper";
import {
    generateBlogBanner,
    generateBlogThumbnail,
    generatePixelAvatar,
    generateProfileBanner,
} from "../utils/pixelAvatar";
import "../styles/editor/editor.css";
import "../styles/katex-fonts.css";

function formatUtcDate(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value * 1000);
    return new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: "UTC",
    }).format(date);
}

function publicBlogHref(blog, fallbackUsername = "") {
    if (blog?.published_as?.startsWith("org:") && blog.org_slug) {
        return `/${blog.org_slug}${blog.collection_slug ? `/${blog.collection_slug}` : ""}/${blog.slug}`;
    }
    return `/${blog?.author_username || fallbackUsername}/${blog?.slug}`;
}

function OrganizationMentionText({ text, organizations = [] }) {
    if (!text) return null;
    const bySlug = new Map(
        organizations.map((org) => [String(org.slug || "").toLowerCase(), org]),
    );
    const source = String(text);
    const nodes = [];
    let cursor = 0;
    for (const match of source.matchAll(/(^|\s)(@[a-z0-9](?:[a-z0-9-]{0,47}))/gi)) {
        const mentionStart = match.index + match[1].length;
        const mention = match[2];
        const org = bySlug.get(mention.slice(1).toLowerCase());
        if (!org) continue;
        nodes.push(source.slice(cursor, mentionStart));
        nodes.push(
                <Link
                    key={`${org.id || org.slug}-${mentionStart}`}
                    href={`/${org.slug}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                >
                    @{org.slug}
                </Link>,
        );
        cursor = mentionStart + mention.length;
    }
    nodes.push(source.slice(cursor));
    return nodes;
}

function StaticInline({ content = [] }) {
    if (!Array.isArray(content)) return null;
    return content.map((item, index) => {
        if (typeof item === "string") return item;
        const text = item?.text || "";
        const styles = item?.styles || {};
        let node = text;
        if (styles.bold) node = <strong>{node}</strong>;
        if (styles.italic) node = <em>{node}</em>;
        if (styles.underline) node = <u>{node}</u>;
        if (styles.strike) node = <s>{node}</s>;
        if (styles.code) node = <code>{node}</code>;
        if (item?.type === "link" && item.href) {
            const href = normalizeUrl(item.href);
            if (href)
                node = (
                    <a href={href} rel="nofollow ugc noopener noreferrer">
                        {item.content ? (
                            <StaticInline content={item.content} />
                        ) : (
                            node
                        )}
                    </a>
                );
        }
        return <span key={index}>{node}</span>;
    });
}

function StaticBlocks({ blocks = [] }) {
    return blocks.map((block, index) => {
        const key = block.id || index;
        const children = block.children?.length ? (
            <StaticBlocks blocks={block.children} />
        ) : null;
        const inline = <StaticInline content={block.content} />;
        switch (block.type) {
            case "heading": {
                const level = Math.max(
                    2,
                    Math.min(4, Number(block.props?.level) || 2),
                );
                const Heading = `h${level}`;
                return <Heading key={key}>{inline}</Heading>;
            }
            case "bulletListItem":
                return (
                    <ul key={key}>
                        <li>
                            {inline}
                            {children}
                        </li>
                    </ul>
                );
            case "numberedListItem":
                return (
                    <ol key={key}>
                        <li>
                            {inline}
                            {children}
                        </li>
                    </ol>
                );
            case "checkListItem":
                return (
                    <p key={key}>
                        □ {inline}
                        {children}
                    </p>
                );
            case "quote":
                return (
                    <blockquote key={key}>
                        {inline}
                        {children}
                    </blockquote>
                );
            case "codeBlock":
                return (
                    <pre key={key}>
                        <code>
                            {(block.content || [])
                                .map((item) => item.text || "")
                                .join("")}
                        </code>
                    </pre>
                );
            case "image": {
                const src = normalizeImageUrl(block.props?.url);
                return src ? (
                    <figure key={key}>
                        <img
                            src={src}
                            alt={block.props.caption || block.props.name || ""}
                            loading="lazy"
                        />
                        {block.props.caption && (
                            <figcaption>{block.props.caption}</figcaption>
                        )}
                    </figure>
                ) : null;
            }
            case "mermaidBlock":
                return (
                    <pre key={key}>
                        <code>{block.props?.diagram || ""}</code>
                    </pre>
                );
            case "blockEquation":
                return <p key={key}>{block.props?.latex || ""}</p>;
            default:
                return (
                    <p key={key}>
                        {inline}
                        {children}
                    </p>
                );
        }
    });
}

function CrawlableArticle({ blog, blocks, owner, readerAside = null }) {
    const cover =
        blog.cover_image_r2_key || generateBlogBanner(blog.id || blog.slug);
    const author = blog.secret
        ? "Anonymous"
        : blog.author_name || blog.author_username || owner?.name || "LixBlogs";
    const designation = blog.secret ? "" : blog.author_designation;
    return (
        <article
            className="blog-preview reader-crawlable"
            itemScope
            itemType="https://schema.org/BlogPosting"
        >
            {blog.published_at && (
                <meta
                    itemProp="datePublished"
                    content={new Date(blog.published_at * 1000).toISOString()}
                />
            )}
            {blog.updated_at && (
                <meta
                    itemProp="dateModified"
                    content={new Date(blog.updated_at * 1000).toISOString()}
                />
            )}
            <section className="blog-preview-hero" aria-labelledby="story-title">
            <div className="blog-preview-visual relative">
                {cover && (
                    <div className="blog-preview-cover overflow-hidden rounded-xl">
                        <img
                            src={cover}
                            alt={blog.title ? `${blog.title} cover` : "Blog cover"}
                            className="h-full w-full object-cover"
                            itemProp="image"
                        />
                    </div>
                )}
                {blog.page_emoji && (
                    <div className="absolute bottom-[-24px] left-4 z-10 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-[var(--bg-app)] bg-[var(--bg-app)] text-[42px] shadow-lg" aria-hidden="true">
                        {blog.page_emoji}
                    </div>
                )}
                {blog.page_emoji && cover && <div className="h-8" />}
            </div>
            <header className="blog-preview-header">
                <h1
                    id="story-title"
                    className="blog-preview-title text-4xl sm:text-5xl font-bold leading-tight"
                    itemProp="headline"
                >
                    {blog.title || "Untitled"}
                </h1>
                {blog.subtitle && (
                    <p
                        className="blog-preview-subtitle text-xl mt-4"
                        style={{ color: "var(--text-muted)" }}
                        itemProp="description"
                    >
                        {blog.subtitle}
                    </p>
                )}
                {!!blog.tags?.length && (
                    <p
                        className="blog-preview-topics mt-3 flex flex-wrap items-center gap-2 text-sm"
                        style={{ color: "var(--text-faint)" }}
                    >
                        <span>Topics:</span>
                        {blog.tags.map((tag) => (
                            <Link
                                key={tag}
                                href={`/tag/${encodeURIComponent(tag)}`}
                                rel="tag"
                                className="hover:text-[#9b7bf7]"
                            >
                                #{tag}
                            </Link>
                        ))}
                    </p>
                )}
                <p
                    className="blog-preview-byline mt-5 text-sm"
                    style={{ color: "var(--text-faint)" }}
                >
                    By {blog.secret || !blog.author_username ? (
                        <span itemProp="author">{author}</span>
                    ) : (
                        <span
                            itemProp="author"
                            itemScope
                            itemType="https://schema.org/Person"
                        >
                            <Link
                                href={`/${encodeURIComponent(blog.author_username)}`}
                                rel="author"
                                itemProp="url"
                            >
                                <span itemProp="name">{author}</span>
                            </Link>
                            {designation ? (
                                <>
                                    {" · "}
                                    <span itemProp="jobTitle">{designation}</span>
                                </>
                            ) : ""}
                        </span>
                    )}
                    {blog.published_at
                        ? <>{" · "}<time dateTime={new Date(blog.published_at * 1000).toISOString()}>{formatUtcDate(blog.published_at, { year: "numeric", month: "short", day: "numeric" })}</time></>
                        : ""}
                </p>
            </header>
            </section>
            <div className={`blog-preview-body ${readerAside ? "has-reader-aside" : ""}`}>
                {readerAside}
                <div
                    className="blog-preview-content max-w-none"
                    itemProp="articleBody"
                >
                    <StaticBlocks blocks={blocks} />
                </div>
            </div>
        </article>
    );
}

function FollowButton({ username }) {
    const { user: currentUser } = useAuth();
    const [following, setFollowing] = useState(false);
    const [isSelf, setIsSelf] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        let active = true;
        fetch(`/api/users/${encodeURIComponent(username)}/follow`)
            .then((r) => r.json())
            .then((d) => {
                if (active) {
                    setFollowing(!!d.following);
                    setIsSelf(!!d.self);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [username, currentUser]);

    if (isSelf) return null;

    const toggle = () => {
        // Not signed in → send to sign-in, then back here to follow.
        if (!currentUser) {
            const next =
                typeof window !== "undefined"
                    ? window.location.pathname
                    : `/${username}`;
            window.location.href = `/sign-in?next=${encodeURIComponent(next)}`;
            return;
        }
        // Optimistic: flip instantly, write in the background, revert on failure.
        const wasFollowing = following;
        setFollowing(!wasFollowing);
        fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
            method: wasFollowing ? "DELETE" : "POST",
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((d) => setFollowing(!!d.following))
            .catch(() => setFollowing(wasFollowing));
    };

    return (
        <button
            onClick={toggle}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all shrink-0 disabled:opacity-60 ${
                following
                    ? "bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#9b7bf7]/50"
                    : "bg-[#9b7bf7] text-white hover:bg-[#8b6ae6]"
            }`}
        >
            <ion-icon
                name={following ? "checkmark-outline" : "add-outline"}
                style={{ fontSize: "15px" }}
            />
            {following ? "Following" : "Follow"}
        </button>
    );
}

const FILTER_TABS = [
    { key: "newest", label: "Newest", icon: "time-outline" },
    { key: "popular", label: "Popular", icon: "flame-outline" },
    { key: "oldest", label: "Oldest", icon: "hourglass-outline" },
    { key: "collections", label: "Collections", icon: "folder-outline" },
    { key: "coauthored", label: "Co-authored", icon: "people-outline" },
];

const PROFILE_TABS = [
    { key: "overview", label: "Overview", icon: "person-circle-outline" },
    { key: "blogs", label: "Blogs", icon: "newspaper-outline" },
    { key: "badges", label: "Badges", icon: "ribbon-outline" },
];

function ProfilePostCard({ blog, username }) {
    const cover = blog.cover_image_r2_key || generateBlogThumbnail(blog.id || blog.slug);
    return (
        <Link
            href={publicBlogHref(blog, username)}
            className="group block overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] transition-all hover:-translate-y-0.5 hover:border-[#9b7bf7]/45 hover:shadow-lg hover:shadow-[#9b7bf7]/5"
        >
            <article className="flex flex-col sm:flex-row">
                <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-40 w-full object-cover sm:h-auto sm:min-h-36 sm:w-48 lg:w-56"
                />
                <div className="min-w-0 flex-1 p-5 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        {(blog.tags || []).slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-[#9b7bf7]/10 px-2.5 py-1 text-[10px] font-semibold text-[#9b7bf7]">
                                #{tag}
                            </span>
                        ))}
                    </div>
                    <h3 className="text-[19px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[#9b7bf7]">
                        {blog.title || "Untitled"}
                    </h3>
                    {blog.subtitle && (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--text-muted)]">
                            {blog.subtitle}
                        </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--text-faint)]">
                        {blog.published_at && (
                            <span>{formatUtcDate(blog.published_at, { month: "short", day: "numeric", year: "numeric" })}</span>
                        )}
                        {blog.read_time_minutes > 0 && <span>{blog.read_time_minutes} min read</span>}
                        {blog.like_count > 0 && <span>{blog.like_count} likes</span>}
                        {blog.comment_count > 0 && <span>{blog.comment_count} comments</span>}
                    </div>
                </div>
            </article>
        </Link>
    );
}

function ProfileBadgeGallery({ badges = [] }) {
    if (!badges.length) {
        return (
            <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--card-bg)] px-6 py-16 text-center">
                <ion-icon name="ribbon-outline" style={{ fontSize: "34px", color: "var(--text-faint)" }} />
                <p className="mt-3 text-[14px] font-semibold text-[var(--text-muted)]">No public badges yet</p>
                <p className="mt-1 text-[12px] text-[var(--text-faint)]">Achievements this creator chooses to display will appear here.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Creator achievements">
            {badges.map((badge) => (
                <article
                    key={badge.id}
                    tabIndex={0}
                    className="group/badge relative flex min-h-28 items-center gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4 outline-none transition-all hover:-translate-y-0.5 hover:border-[#9b7bf7]/40 hover:shadow-lg focus-visible:border-[#9b7bf7] focus-visible:ring-2 focus-visible:ring-[#9b7bf7]/20"
                    aria-describedby={`badge-description-${badge.id}`}
                >
                    <CreatorBadgeMark badge={badge} size={58} />
                    <div className="min-w-0">
                        <h3 className="text-[14px] font-bold text-[var(--text-primary)]">{badge.name}</h3>
                        <p className="mt-1 text-[11px] font-medium text-[#9b7bf7]">{badge.category}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">{badge.difficulty}</p>
                    </div>
                    <div
                        id={`badge-description-${badge.id}`}
                        role="tooltip"
                        className="pointer-events-none absolute inset-x-3 top-[calc(100%+8px)] z-40 hidden rounded-xl border border-[var(--border-default)] bg-[var(--dropdown-bg,var(--bg-surface))] p-3 text-[11px] leading-5 text-[var(--text-muted)] shadow-xl group-hover/badge:block group-focus/badge:block"
                    >
                        {badge.description}
                        {badge.awarded_at && (
                            <span className="mt-1 block text-[10px] text-[var(--text-faint)]">
                                Earned {formatUtcDate(badge.awarded_at, { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                        )}
                    </div>
                </article>
            ))}
        </div>
    );
}

function ProfileContent({ username, initialBlogs = [], tags = [], timezone, badges = [] }) {
    const [section, setSection] = useState("overview");
    const [filter, setFilter] = useState("newest");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTag, setActiveTag] = useState("");
    const [urlReady, setUrlReady] = useState(false);
    const [posts, setPosts] = useState(initialBlogs || []);
    const [cursor, setCursor] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);

    // Read deep-linked profile state after hydration so server and client render
    // the same initial tab and do not produce a hydration mismatch.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requestedSection = params.get("tab");
        const requestedFilter = params.get("filter");
        setSection(
            PROFILE_TABS.some((tab) => tab.key === requestedSection)
                ? requestedSection
                : params.has("filter") || params.has("q") || params.has("tag")
                  ? "blogs"
                  : "overview",
        );
        setFilter(FILTER_TABS.some((tab) => tab.key === requestedFilter) ? requestedFilter : "newest");
        setSearchQuery(params.get("q") || "");
        setActiveTag(params.get("tag") || "");
        setUrlReady(true);
    }, []);

    const updateUrl = useCallback(
        (view, f, q, t) => {
            if (typeof window === "undefined") return;
            const params = new URLSearchParams();
            if (view !== "overview") params.set("tab", view);
            if (view === "blogs") {
                if (f && f !== "newest") params.set("filter", f);
                if (q) params.set("q", q);
                if (t) params.set("tag", t);
            }
            const qs = params.toString();
            const newUrl = `/${username}${qs ? `?${qs}` : ""}`;
            window.history.replaceState(null, "", newUrl);
        },
        [username],
    );

    // Fetch posts from API
    const fetchPosts = useCallback(
        async (f, q, t, c) => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ filter: f, limit: "10" });
                if (q) params.set("q", q);
                if (t) params.set("tag", t);
                if (c) params.set("cursor", c);
                const res = await fetch(
                    `/api/users/${encodeURIComponent(username)}/posts?${params}`,
                );
                if (!res.ok) throw new Error("Failed to load");
                const data = await res.json();
                if (c) {
                    setPosts((prev) => [...prev, ...(data.posts || [])]);
                } else {
                    setPosts(data.posts || []);
                }
                setCursor(data.nextCursor || null);
                setHasMore(!!data.hasMore);
            } catch {
                if (!c) setPosts([]);
            } finally {
                setLoading(false);
            }
        },
        [username],
    );

    useEffect(() => {
        if (!urlReady) return;
        updateUrl(section, filter, searchQuery, activeTag);
        if (section !== "blogs") return;
        fetchPosts(filter, searchQuery, activeTag, null);
    }, [
        section,
        filter,
        searchQuery,
        activeTag,
        fetchPosts,
        updateUrl,
        urlReady,
    ]);

    const handleFilterChange = (f) => {
        setFilter(f);
        setSearchQuery("");
        setActiveTag("");
    };

    const handleSearch = (e) => {
        e.preventDefault();
        // searchQuery state already triggers the effect
    };

    const handleTagClick = (tag) => {
        setActiveTag(activeTag === tag ? "" : tag);
        setSection("blogs");
    };

    const loadMore = () => {
        if (cursor && !loading) {
            fetchPosts(filter, searchQuery, activeTag, cursor);
        }
    };

    const topPicks = [...initialBlogs]
        .sort((a, b) => ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0)) || (b.published_at || 0) - (a.published_at || 0))
        .slice(0, 3);

    return (
        <div>
            <div className="mb-7 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1" role="tablist" aria-label="Profile sections">
                {PROFILE_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={section === tab.key}
                        onClick={() => setSection(tab.key)}
                        className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all ${section === tab.key ? "bg-[var(--bg-app)] text-[#9b7bf7] shadow-sm ring-1 ring-[var(--border-default)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"}`}
                    >
                        <ion-icon name={tab.icon} style={{ fontSize: "16px" }} />
                        {tab.label}
                        {tab.key === "badges" && badges.length > 0 && (
                            <span className="rounded-full bg-[#9b7bf7]/12 px-1.5 py-0.5 text-[10px] text-[#9b7bf7]">{badges.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {section === "overview" && (
                <div role="tabpanel" className="space-y-7">
                    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                        <section>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Top stories</h2>
                                {initialBlogs.length > 3 && (
                                    <button onClick={() => setSection("blogs")} className="text-[12px] font-semibold text-[#9b7bf7] hover:underline">View all</button>
                                )}
                            </div>
                            <div className="space-y-2.5">
                                {topPicks.length ? topPicks.map((blog, index) => (
                                    <Link key={blog.id} href={publicBlogHref(blog, username)} className="group flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-3 transition-colors hover:border-[#9b7bf7]/35">
                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#9b7bf7]/10 text-[12px] font-bold text-[#9b7bf7]">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[#9b7bf7]">{blog.title || "Untitled"}</p>
                                            <p className="mt-1 text-[10px] text-[var(--text-faint)]">{blog.read_time_minutes || 1} min read{blog.like_count ? ` · ${blog.like_count} likes` : ""}</p>
                                        </div>
                                    </Link>
                                )) : (
                                    <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-[13px] text-[var(--text-faint)]">No public stories yet</div>
                                )}
                            </div>
                        </section>

                        <section>
                            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Top topics</h2>
                            <div className="min-h-36 rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4">
                                {tags.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {tags.slice(0, 12).map((topic) => (
                                            <button key={topic.tag} onClick={() => handleTagClick(topic.tag)} className="rounded-full border border-transparent bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition-all hover:border-[#9b7bf7]/30 hover:text-[#9b7bf7]">
                                                #{topic.tag} <span className="ml-1 text-[var(--text-faint)]">{topic.count}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : <p className="text-[12px] text-[var(--text-faint)]">Topics will appear as stories are published.</p>}
                            </div>
                        </section>
                    </div>

                    <section className="w-full">
                        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Publishing activity</h2>
                        <ContributionGraph username={username} timezone={timezone} />
                    </section>
                </div>
            )}

            {section === "blogs" && (
                <div role="tabpanel">
                    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Blog filters">
                            {FILTER_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            role="tab"
                            aria-selected={filter === tab.key}
                            aria-label={`Filter: ${tab.label}`}
                            onClick={() => handleFilterChange(tab.key)}
                                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${
                                filter === tab.key
                                    ? "bg-[#9b7bf7]/15 text-[#9b7bf7] border border-[#9b7bf7]/30"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                            }`}
                        >
                            <ion-icon
                                name={tab.icon}
                                style={{ fontSize: "14px" }}
                            />
                            {tab.label}
                        </button>
                            ))}
                        </div>
                        <form onSubmit={handleSearch} className="w-full lg:w-72">
                            <div className="relative">
                        <ion-icon
                            name="search-outline"
                            style={{
                                fontSize: "15px",
                                position: "absolute",
                                left: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-faint)",
                            }}
                        />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search posts..."
                            aria-label="Search this creator's posts"
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[#9b7bf7]/50 transition-colors placeholder-[var(--text-faint)]"
                                />
                            </div>
                        </form>
                    </div>

                {/* Active tag indicator */}
                {activeTag && (
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-[12px] text-[var(--text-muted)]">
                            Filtered by:
                        </span>
                        <button
                            onClick={() => setActiveTag("")}
                            className="flex items-center gap-1 px-2.5 py-1 bg-[#9b7bf7]/15 text-[#9b7bf7] rounded-full text-[12px] font-medium hover:bg-[#9b7bf7]/25 transition-colors"
                        >
                            #{activeTag}
                            <ion-icon
                                name="close-outline"
                                style={{ fontSize: "13px" }}
                            />
                        </button>
                    </div>
                )}

                {posts.length > 0 ? (
                    <div className="space-y-4">
                        {posts.map((b) => (
                            <ProfilePostCard key={b.id} blog={b} username={username} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl">
                        <ion-icon
                            name="document-text-outline"
                            style={{
                                fontSize: "36px",
                                color: "var(--text-faint)",
                            }}
                        />
                        <p className="text-[var(--text-faint)] text-[14px] mt-3">
                            {searchQuery || activeTag
                                ? "No posts match this filter"
                                : "No published posts yet"}
                        </p>
                    </div>
                )}

                {/* Load more */}
                {hasMore && (
                    <div className="text-center mt-6">
                        <button
                            onClick={loadMore}
                            disabled={loading}
                            className="px-6 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-[13px] text-[var(--text-body)] font-medium hover:text-[var(--text-primary)] hover:border-[#9b7bf7]/50 transition-all disabled:opacity-40"
                        >
                            {loading ? "Loading..." : "Load more"}
                        </button>
                    </div>
                )}

                {loading && posts.length === 0 && (
                    <div className="space-y-3 mt-4">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-20 bg-[var(--bg-elevated)] animate-pulse rounded-xl"
                            />
                        ))}
                    </div>
                )}
                </div>
            )}

            {section === "badges" && (
                <section role="tabpanel">
                    <div className="mb-5">
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Achievements</h2>
                        <p className="mt-1 text-[13px] text-[var(--text-muted)]">Public milestones earned through writing, readership, and community work.</p>
                    </div>
                    <ProfileBadgeGallery badges={badges} />
                </section>
            )}
        </div>
    );
}

export default function HandlePage(props) {
    // The invite overlay sits above the reader (mounted behind it, blurred) when
    // the URL carries ?invite=<blogId> from a collaboration invite notification.
    return (
        <>
            <HandlePageInner {...props} />
            <BlogInviteOverlay />
        </>
    );
}

function HandlePageInner({ path, initialData = null }) {
    const router = useRouter();
    const { user: currentUser } = useAuth();
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState(null);
    const [followModal, setFollowModal] = useState(null); // 'followers' | 'following'
    const [hideHighlights, setHideHighlights] = useState(false); // strip text colors/highlights
    const [InteractiveBlogPreview, setInteractiveBlogPreview] = useState(null);
    const [revision, setRevision] = useState(null); // historical revision shown in place of the article body

    // Mermaid and Shiki stay browser-only to protect the Edge bundle. Keep the
    // crawlable article mounted until this chunk has actually loaded; switching
    // on hydration alone created a blank reader while the chunk was in flight.
    useEffect(() => {
        if (data?.type !== "blog") {
            setInteractiveBlogPreview(null);
            return;
        }
        let active = true;
        import("../components/Editor/BlogPreview").then((module) => {
            if (active) setInteractiveBlogPreview(() => module.default);
        }).catch(() => {
            // The static article remains fully readable if the enhancement fails.
        });
        return () => {
            active = false;
        };
    }, [data?.type]);

    // Parse: path[0] = name, path[1] = slug or collection, path[2] = slug (if collection)
    // rawName keeps the original case: a 1-segment path may be a /[slugid] short link,
    // and blog ids are case-sensitive where usernames and org slugs are not.
    const rawName = path?.[0] || "";
    const name = rawName.toLowerCase();
    const second = (path?.[1] || "").toLowerCase();
    const third = (path?.[2] || "").toLowerCase();

    // If 1 segment: profile. If 2: blog or collection listing. If 3: blog in collection.
    // Special case: /<username>/reads/<list-slug> is a shared reading list.
    const isReadingList = path?.length === 3 && second === "reads";
    const isProfile = path?.length === 1;
    const slug = path?.length === 2 ? second : path?.length === 3 ? third : "";
    const collection = path?.length === 3 ? second : "";

    useEffect(() => {
        if (!name) {
            setLoading(false);
            setError("Not found");
            return;
        }

        // Public page data was rendered on the server. A member-only teaser is
        // refreshed after authentication so an entitled reader still gets the
        // complete post without sacrificing crawlable initial HTML.
        if (initialData && !(initialData.blog?.paywalled && currentUser))
            return;

        if (isReadingList) {
            fetch(
                `/api/library/public?username=${encodeURIComponent(name)}&slug=${encodeURIComponent(third)}`,
            )
                .then((r) =>
                    r.ok
                        ? r.json()
                        : r.json().then((d) => {
                              throw new Error(d.error || "Not found");
                          }),
                )
                .then((d) => setData({ type: "readingList", ...d }))
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            return;
        }

        const params = new URLSearchParams({ name: rawName });
        if (slug) params.set("slug", slug);
        if (collection) params.set("collection", collection);

        fetch(`/api/resolve?${params}`, { cache: "no-store" })
            .then((r) =>
                r.ok
                    ? r.json()
                    : r.json().then((d) => {
                          throw new Error(d.error || "Not found");
                      }),
            )
            .then((d) => {
                if (d?.type === "redirect" && d.location) {
                    window.location.replace(d.location);
                    return;
                }
                setData(d);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [
        rawName,
        name,
        slug,
        collection,
        isReadingList,
        third,
        initialData,
        currentUser,
    ]);

    if (loading) {
        return (
            <AppShell>
                <div className="max-w-3xl mx-auto min-[1400px]:ml-[96px] px-6 py-10">
                    <div className="h-44 rounded-xl bg-[var(--bg-elevated)] animate-pulse mb-16" />
                    <div className="h-8 bg-[var(--bg-elevated)] animate-pulse rounded w-2/3 mb-4" />
                    <div className="h-4 bg-[var(--bg-elevated)] animate-pulse rounded w-1/3 mb-6" />
                    <div className="space-y-3">
                        {[76, 92, 68, 84].map((width, i) => (
                            <div
                                key={i}
                                className="h-4 bg-[var(--bg-elevated)] animate-pulse rounded"
                                style={{ width: `${width}%` }}
                            />
                        ))}
                    </div>
                </div>
            </AppShell>
        );
    }

    if (error || !data) {
        return (
            <AppShell>
                <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
                    <p className="text-6xl mb-4 text-[#232d3f]">404</p>
                    <p className="text-[var(--text-muted)] text-[15px] mb-6">
                        {error || "Page not found"}
                    </p>
                    <Link
                        href="/"
                        className="text-[#9b7bf7] text-[13px] hover:text-[#b69aff]"
                    >
                        Go home
                    </Link>
                </div>
            </AppShell>
        );
    }

    // ── Blog view ──
    if (data.type === "blog") {
        const blog = data.blog;
        let blocks = [];
        try {
            blocks =
                typeof blog.content === "string"
                    ? JSON.parse(blog.content)
                    : blog.content || [];
        } catch {
            blocks = [];
        }

        // Count words from blocks
        const countBlockWords = (b) =>
            (Array.isArray(b) ? b : []).reduce((sum, block) => {
                const text = (Array.isArray(block.content) ? block.content : [])
                    .map((c) => c.text || "")
                    .join(" ");
                return (
                    sum +
                    text.split(/\s+/).filter(Boolean).length +
                    countBlockWords(block.children)
                );
            }, 0);
        const wc = countBlockWords(blocks);

        // Check if current user can edit. Author always can; accepted co-authors
        // with an editor/admin role can edit the cross-posted copy too (viewers
        // get the cross-post on their profile but no edit access).
        const isAuthor = currentUser && blog.author_id === currentUser.id;
        const myCoRole = currentUser
            ? (blog.co_authors || []).find(
                  (c) => c.username === currentUser.username,
              )?.role
            : null;
        const canEdit =
            isAuthor || myCoRole === "editor" || myCoRole === "admin";
        const readerAside = (
            <div
                className="reader-side-rail"
                role="complementary"
                aria-label="About the author and related stories"
            >
                {!blog.secret && (
                    <ReaderCompanion
                        author={{
                            username: blog.author_username,
                            displayName: blog.author_name,
                            designation: blog.author_designation,
                            avatarUrl: blog.author_avatar,
                        }}
                        org={
                            data.owner?.type === "org"
                                ? {
                                      slug: data.owner.slug,
                                      name: data.owner.name,
                                      tagline: data.owner.tagline,
                                      logoUrl:
                                          data.owner.logo_url ||
                                          data.owner.logo_r2_key,
                                  }
                                : null
                        }
                        primaryTag={
                            Array.isArray(blog.tags) ? blog.tags[0] : null
                        }
                    />
                )}
                <BlogRecommendations blogId={blog.id} compact limit={3} />
            </div>
        );

        return (
            <AppShell showSidebar={false}>
                <main className="reader-page w-full">
                <div className="reader-frame w-full overflow-x-hidden">
                    <nav className="reader-context" aria-label="Story context">
                        <button
                            type="button"
                            className="reader-back-button"
                            onClick={() => {
                                if (window.history.length > 1) router.back();
                                else router.push("/explore");
                            }}
                            aria-label="Go back"
                        >
                            <ion-icon name="arrow-back-outline" aria-hidden="true" />
                            Back
                        </button>
                        <Link href="/explore" className="reader-context-link">
                            <ion-icon name="compass-outline" aria-hidden="true" />
                            Explore
                        </Link>
                        <span aria-hidden="true">/</span>
                        {blog.secret ? (
                            <span>Anonymous story</span>
                        ) : (
                            <Link
                                href={`/${encodeURIComponent(data.owner?.slug || blog.author_username)}`}
                                className="reader-context-link"
                            >
                                {data.owner?.type === "org"
                                    ? data.owner.name
                                    : blog.author_name || blog.author_username}
                            </Link>
                        )}
                    </nav>
                    <ReadingResumePrompt blogId={blog.id} />
                    {!blog.secret && !blog.member_only && !blog.paywalled && (
                        <RevisionTimeline blogId={blog.id} onRevision={setRevision} />
                    )}
                    {canEdit && (
                        <div className="flex items-center justify-end mb-4">
                            <Link
                                href={`/edit/${blog.slug || blog.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                                style={{
                                    color: "var(--accent)",
                                    backgroundColor: "var(--accent-subtle)",
                                    border: "1px solid var(--accent)30",
                                }}
                            >
                                <ion-icon
                                    name="create-outline"
                                    style={{ fontSize: "15px" }}
                                />
                                Edit this post
                            </Link>
                        </div>
                    )}
                    <div className="reader-story-main">
                            {InteractiveBlogPreview ? (
                                <InteractiveBlogPreview
                            title={blog.title}
                            subtitle={blog.subtitle}
                            pageEmoji={blog.page_emoji}
                            tags={blog.tags || []}
                            blocks={revision?.content || blocks}
                            coverPreview={
                                blog.cover_image_r2_key ||
                                generateBlogBanner(blog.id || blog.slug)
                            }
                            coverPos={{
                                x: blog.cover_pos_x ?? 50,
                                y: blog.cover_pos_y ?? 50,
                            }}
                            coverZoom={blog.cover_zoom ?? 1}
                            paywalled={blog.paywalled}
                            user={{
                                username: blog.author_username,
                                display_name: blog.author_name,
                                designation: blog.author_designation,
                                avatar_url: blog.author_avatar,
                            }}
                            anonymous={!!blog.secret}
                            readerMode
                            org={
                                data.owner?.type === "org"
                                    ? {
                                          name: data.owner.name,
                                          slug: data.owner.slug,
                                          logo_url:
                                              data.owner.logo_url ||
                                              data.owner.logo_r2_key,
                                      }
                                    : null
                            }
                            coAuthorCount={blog.co_author_count || 0}
                            coAuthors={blog.co_authors || []}
                            wordCount={wc}
                            readTimeMinutes={blog.read_time_minutes || 0}
                            memberOnly={!!blog.member_only}
                            featured={
                                blog.published_as === `org:${STAFF_ORG_ID}`
                            }
                            publishedAt={blog.published_at}
                            hideHighlights={hideHighlights}
                            followSlot={
                                !isAuthor ? (
                                    <>
                                        {data.owner?.type === "org" && (
                                            <FollowToggle
                                                kind="org"
                                                handle={data.owner.slug}
                                                compact
                                            />
                                        )}
                                        {blog.author_username && (
                                            <FollowToggle
                                                kind="user"
                                                handle={blog.author_username}
                                                compact
                                            />
                                        )}
                                    </>
                                ) : null
                            }
                            headerActions={
                                <BlogInteractionBar
                                    blogId={blog.id}
                                    blogTitle={blog.title}
                                    blogAuthorId={blog.author_id}
                                    canRepost={!isAuthor && !myCoRole}
                                    dotsMenu={
                                        <BlogDotsMenu
                                            blogId={blog.id}
                                            authorId={blog.author_id}
                                            author={{
                                                username: blog.author_username,
                                                display_name: blog.author_name,
                                            }}
                                            org={
                                                data.owner?.type === "org"
                                                    ? {
                                                          slug: data.owner.slug,
                                                          name: data.owner.name,
                                                          id: data.owner.id,
                                                      }
                                                    : null
                                            }
                                            tags={blog.tags || []}
                                            hideHighlights={hideHighlights}
                                            onToggleHighlights={() =>
                                                setHideHighlights((v) => !v)
                                            }
                                            canEdit={canEdit}
                                        />
                                    }
                                />
                            }
                            readerAside={readerAside}
                                />
                            ) : (
                                <CrawlableArticle
                                    blog={blog}
                                    blocks={blocks}
                                    owner={data.owner}
                                    readerAside={readerAside}
                                />
                            )}

                            <div className="reader-endmatter">
                                {/* Comments section — always expanded */}
                                <BlogComments
                                    blogId={blog.id}
                                    blogAuthorId={blog.author_id}
                                />
                            </div>
                    </div>
                </div>
                </main>
            </AppShell>
        );
    }

    // ── Shared curated collection ──
    if (data.type === "readingList") {
        const { owner, list, blogs = [] } = data;
        return (
            <AppShell>
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">
                    <div className="mb-8">
                        {list.cover_url && (
                            <img
                                src={list.cover_url}
                                alt=""
                                className="mb-6 h-52 w-full rounded-2xl object-cover"
                            />
                        )}
                        <div
                            className="flex items-center gap-2 text-[13px] mb-3"
                            style={{ color: "var(--text-muted)" }}
                        >
                            <Link
                                href={`/${owner.username}`}
                                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                            >
	                            <img
	                                src={owner.avatar_url || generatePixelAvatar(owner.username || owner.display_name)}
	                                alt=""
	                                className="h-5 w-5 rounded-full object-cover"
	                            />
                                <span style={{ color: "var(--accent)" }}>
                                    {owner.display_name || owner.username}
                                </span>
                            </Link>
                            <span style={{ color: "var(--text-faint)" }}>
                                / curated collection
                            </span>
                        </div>
                        <h1
                            className="text-[28px] font-extrabold tracking-tight"
                            style={{ color: "var(--text-primary)" }}
                        >
                            {list.name}
                        </h1>
                        {list.description && (
                            <p
                                className="text-[15px] mt-2 leading-relaxed"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {list.description}
                            </p>
                        )}
                        {list.introduction && (
                            <div
                                className="text-[14px] mt-4 leading-relaxed rounded-xl p-4"
                                style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                            >
                                {list.introduction}
                            </div>
                        )}
                        <p
                            className="text-[13px] mt-3"
                            style={{ color: "var(--text-faint)" }}
                        >
                            {blogs.length} post{blogs.length !== 1 ? "s" : ""}
                        </p>
                        <div
                            style={{
                                height: "1px",
                                backgroundColor: "var(--divider)",
                                marginTop: "20px",
                            }}
                        />
                    </div>
                    {blogs.length > 0 ? (
                        <div>
                            {blogs.map((b) => (
                                <Link key={b.id} href={publicBlogHref(b)}>
                                    <article
                                        className="group flex gap-5 py-6 cursor-pointer"
                                        style={{
                                            borderBottom:
                                                "1px solid var(--divider)",
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div
                                                className="flex items-center gap-2 mb-1.5 text-[13px]"
                                                style={{
                                                    color: "var(--text-secondary)",
                                                }}
                                            >
                                                {b.author_avatar ? (
                                                    <img
                                                        src={b.author_avatar}
                                                        alt=""
                                                        className="h-5 w-5 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <span
                                                        className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                                                        style={{
                                                            backgroundColor:
                                                                "var(--bg-elevated)",
                                                        }}
                                                    >
                                                        {(b.author_name ||
                                                            b.author_username ||
                                                            "?")[0].toUpperCase()}
                                                    </span>
                                                )}
                                                <span>
                                                    {b.author_name ||
                                                        b.author_username}
                                                </span>
                                                <span style={{ color: "var(--text-faint)" }}>
                                                    · original author
                                                </span>
                                            </div>
                                            <h2
                                                className="text-[19px] font-extrabold leading-[1.3] mb-1 group-hover:opacity-80 transition-opacity"
                                                style={{
                                                    color: "var(--text-primary)",
                                                    fontFamily:
                                                        "'Source Serif 4', Georgia, serif",
                                                }}
                                            >
                                                {b.title || "Untitled"}
                                            </h2>
                                            {(b.subtitle || b.excerpt) && (
                                                <p
                                                    className="text-[14px] leading-[1.5] line-clamp-2"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {b.subtitle || b.excerpt}
                                                </p>
                                            )}
                                            {b.read_time_minutes > 0 && (
                                                <p
                                                    className="text-[12px] mt-2"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {b.read_time_minutes} min
                                                    read
                                                </p>
                                            )}
                                            <p
                                                className="text-[11px] mt-2 uppercase tracking-wide"
                                                style={{ color: "var(--text-faint)" }}
                                            >
                                                License: {b.license || "all-rights-reserved"}
                                            </p>
                                            {b.curatorNote && (
                                                <p
                                                    className="text-[13px] mt-2 italic"
                                                    style={{ color: "var(--text-muted)" }}
                                                >
                                                    Curator note: {b.curatorNote}
                                                </p>
                                            )}
                                            {currentUser?.id === b.author_id && (
                                                <button
                                                    type="button"
                                                    className="text-[12px] mt-3 font-medium text-red-500 hover:underline"
                                                    onClick={async (event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        const response = await fetch(`/api/library/collections/${encodeURIComponent(list.id)}/entries?blogId=${encodeURIComponent(b.id)}`, { method: "DELETE" });
                                                        if (response.ok) setData((current) => ({ ...current, blogs: (current.blogs || []).filter((entry) => entry.id !== b.id) }));
                                                    }}
                                                >
                                                    Remove my story
                                                </button>
                                            )}
                                        </div>
                                        <img
                                            src={
                                                b.cover_image_r2_key ||
                                                generateBlogThumbnail(
                                                    b.id || b.slug,
                                                )
                                            }
                                            alt=""
                                            className="w-[100px] h-[100px] rounded-md object-cover flex-shrink-0 self-center hidden sm:block"
                                            style={{
                                                backgroundColor:
                                                    "var(--bg-elevated)",
                                            }}
                                        />
                                    </article>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <ion-icon
                                name="bookmark-outline"
                                style={{
                                    fontSize: "40px",
                                    color: "var(--text-faint)",
                                }}
                            />
                            <p
                                className="text-[15px] mt-4"
                                style={{ color: "var(--text-muted)" }}
                            >
                                This collection is empty.
                            </p>
                        </div>
                    )}
                </div>
            </AppShell>
        );
    }

    // ── Collection listing ──
    if (data.type === "collection") {
        const org = data.owner;
        const col = data.collection;
        const blogs = data.blogs || [];

        return (
            <AppShell>
                <div className="max-w-3xl mx-auto px-6 py-8">
                    {/* Collection header */}
                    <div className="mb-8">
                        <div
                            className="flex items-center gap-2 text-[13px] mb-3"
                            style={{ color: "var(--text-muted)" }}
                        >
                            <Link
                                href={`/${org.slug}`}
                                className="hover:opacity-70 transition-opacity"
                                style={{ color: "var(--accent)" }}
                            >
                                {org.name}
                            </Link>
                            <span style={{ color: "var(--text-faint)" }}>
                                /
                            </span>
                            <span style={{ color: "var(--text-secondary)" }}>
                                {col.name}
                            </span>
                        </div>
                        <h1
                            className="text-[28px] font-extrabold tracking-tight"
                            style={{ color: "var(--text-primary)" }}
                        >
                            {col.name}
                        </h1>
                        {col.description && (
                            <p
                                className="text-[15px] mt-2 leading-relaxed"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {col.description}
                            </p>
                        )}
                        <p
                            className="text-[13px] mt-3"
                            style={{ color: "var(--text-faint)" }}
                        >
                            {blogs.length} post{blogs.length !== 1 ? "s" : ""}{" "}
                            in this collection
                        </p>
                        <div
                            style={{
                                height: "1px",
                                backgroundColor: "var(--divider)",
                                marginTop: "20px",
                            }}
                        />
                    </div>

                    {/* Blog list — feed-style cards */}
                    {blogs.length > 0 ? (
                        <div>
                            {blogs.map((b) => (
                                <Link
                                    key={b.id}
                                    href={`/${org.slug}/${col.slug}/${b.slug}`}
                                >
                                    <article
                                        className="group py-6 cursor-pointer"
                                        style={{
                                            borderBottom:
                                                "1px solid var(--divider)",
                                        }}
                                    >
                                        <div className="mb-2.5">
                                            <AuthorAttribution
                                                org={{
                                                    name: org.name,
                                                    slug: org.slug,
                                                    logo_url: org.logo_r2_key,
                                                }}
                                                authors={[
                                                    {
                                                        name: b.author_name,
                                                        username:
                                                            b.author_username,
                                                        avatar_url:
                                                            b.author_avatar,
                                                    },
                                                    ...(b.co_authors || []).map(
                                                        (ca) => ({
                                                            name: ca.display_name,
                                                            username:
                                                                ca.username,
                                                            avatar_url:
                                                                ca.avatar_url,
                                                        }),
                                                    ),
                                                ]}
                                                size="sm"
                                            />
                                        </div>
                                        <div className="flex gap-6">
                                            <div className="flex-1 min-w-0">
                                                <h2
                                                    className="text-[19px] font-bold leading-[1.3] mb-1.5 group-hover:opacity-75 transition-opacity font-serif"
                                                    style={{
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {b.title || "Untitled"}
                                                </h2>
                                                {b.subtitle && (
                                                    <p
                                                        className="text-[15px] leading-[1.5] line-clamp-2 mb-3"
                                                        style={{
                                                            color: "var(--text-muted)",
                                                        }}
                                                    >
                                                        {b.subtitle}
                                                    </p>
                                                )}
                                                <div
                                                    className="flex items-center gap-3.5 text-[12px]"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {(b.tags || []).length >
                                                        0 && (
                                                        <span className="text-[#9b7bf7] text-[11px] bg-[#9b7bf714] px-2.5 py-0.5 rounded-full font-medium">
                                                            {b.tags[0]}
                                                        </span>
                                                    )}
                                                    {b.published_at && (
                                                        <span>
                                                            {formatUtcDate(
                                                                b.published_at,
                                                                {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                },
                                                            )}
                                                        </span>
                                                    )}
                                                    {b.read_time_minutes >
                                                        0 && (
                                                        <span>
                                                            {
                                                                b.read_time_minutes
                                                            }{" "}
                                                            min read
                                                        </span>
                                                    )}
                                                    {b.like_count > 0 && (
                                                        <span>
                                                            {b.like_count} likes
                                                        </span>
                                                    )}
                                                    {b.comment_count > 0 && (
                                                        <span>
                                                            {b.comment_count}{" "}
                                                            comments
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <img
                                                src={
                                                    b.cover_image_r2_key ||
                                                    generateBlogThumbnail(
                                                        b.id || b.slug,
                                                    )
                                                }
                                                alt=""
                                                className="w-[100px] h-[100px] rounded-xl object-cover flex-shrink-0 hidden sm:block"
                                            />
                                        </div>
                                    </article>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <ion-icon
                                name="folder-open-outline"
                                style={{
                                    fontSize: "40px",
                                    color: "var(--text-faint)",
                                }}
                            />
                            <p
                                className="text-[15px] mt-4"
                                style={{ color: "var(--text-muted)" }}
                            >
                                No posts in this collection yet
                            </p>
                        </div>
                    )}
                </div>
            </AppShell>
        );
    }

    // ── User profile ──
    if (data.type === "user") {
        const u = data.user;
        const userLinks = (() => {
            try {
                return JSON.parse(u.links || "[]");
            } catch {
                return [];
            }
        })();
        const joined = u.created_at ? new Date(u.created_at * 1000) : null;
        const isOwnProfile = currentUser && currentUser.id === u.id;

        const bannerSrc = u.banner_r2_key
            ? `/api/media/${u.banner_r2_key}?v=${encodeURIComponent(u.updated_at || "")}`
            : generateProfileBanner(u.username || u.id, u.avatar_url);
        const avatarSrc = u.avatar_url || generatePixelAvatar(u.username || u.id);

        return (
            <AppShell>
                <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
                    {/* ── Banner + Avatar ── */}
                    <div className="relative mb-16">
                        <div
                            className="w-full rounded-xl bg-[var(--bg-elevated)] overflow-hidden"
                            style={{ aspectRatio: "4 / 1" }}
                        >
	                            <img
	                                src={bannerSrc}
	                                alt=""
	                                className="w-full h-full object-cover"
	                                loading="eager"
	                            />
                            {/* Gradient overlay for text contrast on banner */}
                            {bannerSrc && (
                                <div
                                    className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none rounded-b-xl"
                                    style={{
                                        background:
                                            "linear-gradient(to top, rgba(0,0,0,0.35), transparent)",
                                    }}
                                />
                            )}
                        </div>
                        {/* Avatar overlapping banner bottom */}
                        <div className="absolute -bottom-12 left-5 sm:left-6">
	                            <img
	                                src={avatarSrc}
	                                alt=""
	                                className="h-[88px] w-[88px] rounded-full border-4 border-[var(--bg-app)] object-cover shadow-lg shadow-black/20"
	                            />
                        </div>
                    </div>

                    {/* ── Name + Actions ── */}
                    <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-[26px] font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                                    {u.display_name || u.username}
                                    {u.pronouns && (
                                        <span className="text-[14px] font-normal text-[var(--text-faint)] ml-2">
                                            ({u.pronouns})
                                        </span>
                                    )}
                                </h1>
                            </div>
                            <p className="text-[var(--text-muted)] text-[15px] mt-0.5 font-medium">
                                @{u.username}
                            </p>
                            {u.designation && (
                                <p className="mt-1 text-[14px] font-medium text-[var(--text-secondary)]">
                                    {u.designation}
                                </p>
                            )}
                        </div>
                        {isOwnProfile ? (
                            <Link
                                href="/settings"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-full text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#9b7bf7]/50 hover:bg-[#9b7bf7]/10 transition-all shrink-0"
                            >
                                <ion-icon
                                    name="create-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                Edit
                            </Link>
                        ) : (
                            <FollowButton username={u.username} />
                        )}
                    </div>

                    {/* ── Bio ── */}
                    {u.bio && (
                        <p className="whitespace-pre-wrap text-[var(--text-secondary)] text-[15px] leading-relaxed mb-4">
                            <OrganizationMentionText text={u.bio} organizations={data.organizations} />
                        </p>
                    )}

                    {/* ── Meta info row ── */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--text-muted)]">
                        {u.company && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="business-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                <OrganizationMentionText text={u.company} organizations={data.organizations} />
                            </span>
                        )}
                        {u.location && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="location-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {u.location}
                            </span>
                        )}
                        {u.timezone && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="time-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {u.timezone.replace(/_/g, " ")}
                            </span>
                        )}
                        {u.website && (
                            <a
                                href={
                                    u.website.startsWith("http")
                                        ? u.website
                                        : `https://${u.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 hover:text-[#60a5fa] transition-colors"
                            >
                                <ion-icon
                                    name="globe-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {u.website
                                    .replace(/^https?:\/\//, "")
                                    .replace(/\/$/, "")}
                            </a>
                        )}
                        {joined && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="calendar-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                Joined{" "}
                                {formatUtcDate(joined, {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </span>
                        )}
                    </div>

                    {/* ── Social links ── */}
                    {userLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {userLinks
                                .filter((l) => l.url?.trim())
                                .map((link, i) => {
                                    const iconMap = {
                                        github: "logo-github",
                                        twitter: "logo-twitter",
                                        linkedin: "logo-linkedin",
                                        mastodon: "globe-outline",
                                        website: "globe-outline",
                                    };
                                    const icon =
                                        iconMap[link.type] || "link-outline";
                                    return (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-full text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all"
                                        >
                                            <ion-icon
                                                name={icon}
                                                style={{ fontSize: "14px" }}
                                            />
                                            {link.label || link.type || "Link"}
                                        </a>
                                    );
                                })}
                        </div>
                    )}

                    {/* ── Followers / Following ── */}
                    <div className="flex items-center gap-5 text-[14px] text-[var(--text-muted)] mt-4 mb-6">
                        <button
                            onClick={() => setFollowModal("followers")}
                            className="hover:text-[var(--text-primary)] transition-colors"
                        >
                            <strong className="text-[var(--text-primary)]">
                                {u.followers}
                            </strong>{" "}
                            Followers
                        </button>
                        <button
                            onClick={() => setFollowModal("following")}
                            className="hover:text-[var(--text-primary)] transition-colors"
                        >
                            <strong className="text-[var(--text-primary)]">
                                {u.following}
                            </strong>{" "}
                            Following
                        </button>
                    </div>
                    {followModal && (
                        <FollowListModal
                            username={u.username}
                            type={followModal}
                            onClose={() => setFollowModal(null)}
                        />
                    )}

                    <div className="h-px bg-[var(--border-default)] mb-6" />

                    {/* ── Profile content ── */}
                    <ProfileContent
                        username={u.username}
                        initialBlogs={data.blogs || []}
                        tags={data.tags || []}
                        timezone={u.timezone}
                        badges={u.badges || []}
                    />
                </div>
            </AppShell>
        );
    }

    // ── Org profile ──
    if (data.type === "org") {
        const org = data.org;
        const owner = data.owner;
        const members = data.members || [];
        const collections = data.collections || [];
        const blogs = data.blogs || [];
        const logoSrc = org.logo_url || generatePixelAvatar(org.slug);
        const links = (() => {
            try {
                return JSON.parse(org.links || "[]");
            } catch {
                return [];
            }
        })();
        const founded = org.created_at ? new Date(org.created_at * 1000) : null;

        // Check if current user can manage this org (admin or maintain role)
        const currentMember = currentUser
            ? members.find((m) => m.id === currentUser.id)
            : null;
        const canManage =
            currentMember && ["admin", "maintain"].includes(currentMember.role);

        const roleBadge = (role) => {
            const styles = {
                admin: "bg-[#9b7bf7]/15 text-[#c4b5fd] border-[#9b7bf7]/30",
                maintain: "bg-[#60a5fa]/15 text-[#93c5fd] border-[#60a5fa]/30",
                write: "bg-[#4ade80]/15 text-[#86efac] border-[#4ade80]/30",
                read: "bg-[#9ca3af]/10 text-[var(--text-muted)] border-[#9ca3af]/20",
                member: "bg-[#9ca3af]/10 text-[var(--text-muted)] border-[#9ca3af]/20",
            };
            return styles[role] || styles.member;
        };

        return (
            <AppShell>
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
                    {/* ── Logo + Header ── */}
                    <div className="flex items-start gap-5 mb-6">
                        <img
                            src={logoSrc}
                            alt={org.name}
                            className="h-[88px] w-[88px] rounded-2xl border-[3px] border-[var(--border-default)] object-cover shadow-lg shadow-black/20 shrink-0"
                        />
                        <div className="min-w-0 flex-1 pt-1">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="text-[26px] font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                                        {org.name}
                                    </h1>
                                    {org.tagline && (
                                        <p className="mt-1 text-[14px] font-semibold leading-snug text-[var(--text-secondary)]">
                                            {org.tagline}
                                        </p>
                                    )}
                                    <p className="text-[var(--text-muted)] text-[15px] mt-0.5 font-medium">
                                        @{org.slug}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {org.visibility === "private" && (
                                        <span className="px-2.5 py-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-full text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                                            <ion-icon
                                                name="lock-closed"
                                                style={{ fontSize: "11px" }}
                                            />
                                            Private
                                        </span>
                                    )}
                                    {!currentMember && (
                                        <FollowToggle
                                            kind="org"
                                            handle={org.slug}
                                        />
                                    )}
                                    {canManage && (
                                        <Link
                                            href={`/settings/org/${org.slug}`}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-full text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#9b7bf7]/50 hover:bg-[#9b7bf7]/10 transition-all"
                                            title="Manage organization"
                                        >
                                            <ion-icon
                                                name="settings-outline"
                                                style={{ fontSize: "14px" }}
                                            />
                                            Manage
                                        </Link>
                                    )}
                                </div>
                            </div>
                            {org.website && (
                                <a
                                    href={org.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 mt-2 text-[13px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
                                >
                                    <ion-icon
                                        name="globe-outline"
                                        style={{ fontSize: "13px" }}
                                    />
                                    {org.website
                                        .replace(/^https?:\/\//, "")
                                        .replace(/\/$/, "")}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* ── Description / Bio ── */}
                    {(org.description || org.bio) && (
                        <div className="mt-4 space-y-1.5">
                            {org.description && (
                                <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed">
                                    {org.description}
                                </p>
                            )}
                            {org.bio && org.bio !== org.description && (
                                <p className="text-[var(--text-muted)] text-[14px] leading-relaxed">
                                    {org.bio}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Meta info row ── */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-[13px] text-[var(--text-muted)]">
                        {org.location && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="location-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {org.location}
                            </span>
                        )}
                        {org.timezone && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="time-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {org.timezone.replace(/_/g, " ")}
                            </span>
                        )}
                        {org.contact_email && (
                            <a
                                href={`mailto:${org.contact_email}`}
                                className="flex items-center gap-1.5 hover:text-[#60a5fa] transition-colors"
                            >
                                <ion-icon
                                    name="mail-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {org.contact_email}
                            </a>
                        )}
                        {founded && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="calendar-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                Founded{" "}
                                {formatUtcDate(founded, {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5">
                            <ion-icon
                                name="people-outline"
                                style={{ fontSize: "14px" }}
                            />
                            {members.length} member
                            {members.length !== 1 ? "s" : ""}
                        </span>
                        {blogs.length > 0 && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="document-text-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {blogs.length} post
                                {blogs.length !== 1 ? "s" : ""}
                            </span>
                        )}
                        {collections.length > 0 && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="folder-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                {collections.length} collection
                                {collections.length !== 1 ? "s" : ""}
                            </span>
                        )}
                        {org.visibility === "public" && (
                            <span className="flex items-center gap-1.5">
                                <ion-icon
                                    name="earth-outline"
                                    style={{ fontSize: "14px" }}
                                />
                                Public
                            </span>
                        )}
                    </div>

                    {/* ── Social links ── */}
                    {links.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {links
                                .filter((l) => l.url?.trim())
                                .map((link, i) => {
                                    const iconMap = {
                                        github: "logo-github",
                                        twitter: "logo-twitter",
                                        linkedin: "logo-linkedin",
                                        discord: "logo-discord",
                                        youtube: "logo-youtube",
                                        website: "globe-outline",
                                    };
                                    const icon =
                                        iconMap[link.type] || "link-outline";
                                    return (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-full text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all"
                                        >
                                            <ion-icon
                                                name={icon}
                                                style={{ fontSize: "14px" }}
                                            />
                                            {link.label || link.type || "Link"}
                                        </a>
                                    );
                                })}
                        </div>
                    )}

                    <div className="h-px bg-[var(--border-default)] mt-7 mb-7" />

                    {/* ── Owner card ── */}
                    {owner && (
                        <div className="mb-7">
                            <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-3">
                                Owned by
                            </h3>
                            <Link
                                href={`/${owner.username}`}
                                className="flex items-center gap-3.5 p-3.5 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl hover:border-[var(--border-default)] transition-colors group"
                            >
	                            <img
	                                src={owner.avatar_url || generatePixelAvatar(owner.username || owner.display_name)}
	                                alt=""
	                                className="h-11 w-11 rounded-full object-cover ring-2 ring-[#9b7bf7]/30"
	                            />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] text-[var(--text-primary)] font-semibold group-hover:text-[#c4b5fd] transition-colors truncate">
                                        {owner.display_name || owner.username}
                                    </p>
                                    <p className="text-[13px] text-[var(--text-muted)]">
                                        @{owner.username}
                                    </p>
                                </div>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${roleBadge("admin")}`}
                                >
                                    Owner
                                </span>
                            </Link>
                        </div>
                    )}

                    {/* ── Members (excluding owner, already shown above) ── */}
                    {members.filter((m) => !owner || m.id !== owner.id).length >
                        0 && (
                        <div className="mb-7">
                            <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-3">
                                Members
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {members
                                    .filter((m) => !owner || m.id !== owner.id)
                                    .map((m) => (
                                        <Link
                                            key={m.id}
                                            href={`/${m.username}`}
                                            className="flex items-center gap-3 p-3 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl hover:border-[var(--border-default)] transition-colors group"
                                        >
	                                        <img
	                                            src={m.avatar_url || generatePixelAvatar(m.username || m.display_name)}
	                                            alt=""
	                                            className="h-9 w-9 rounded-full object-cover"
	                                        />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[14px] text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)] transition-colors truncate">
                                                    {m.display_name ||
                                                        m.username}
                                                </p>
                                                <p className="text-[12px] text-[var(--text-faint)]">
                                                    @{m.username}
                                                </p>
                                            </div>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${roleBadge(m.role)}`}
                                            >
                                                {m.id === org.owner_id
                                                    ? "Owner"
                                                    : m.role}
                                            </span>
                                        </Link>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* ── Collections ── */}
                    {collections.length > 0 && (
                        <div className="mb-7">
                            <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-3">
                                Collections
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {collections.map((c) => (
                                    <Link
                                        key={c.id}
                                        href={`/${org.slug}/${c.slug}`}
                                        className="p-4 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl hover:border-[var(--border-default)] transition-colors group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-9 w-9 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                                                <ion-icon
                                                    name="folder"
                                                    style={{
                                                        fontSize: "18px",
                                                        color: "#60a5fa",
                                                    }}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[14px] text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)] transition-colors truncate">
                                                    {c.name}
                                                </p>
                                                {c.description && (
                                                    <p className="text-[12px] text-[var(--text-faint)] truncate">
                                                        {c.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Published blogs ── */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-3">
                            Published{" "}
                            {blogs.length > 0 && (
                                <span className="text-[var(--text-muted)] ml-1">
                                    ({blogs.length})
                                </span>
                            )}
                        </h3>
                        {blogs.length > 0 ? (
                            <div className="space-y-2.5">
                                {blogs.map((b) => (
                                    <Link
                                        key={b.id}
                                        href={`/${org.slug}${b.collection_slug ? `/${b.collection_slug}` : ""}/${b.slug}`}
                                        className="block p-4 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl hover:border-[var(--border-default)] transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            {b.cover_image_r2_key && (
                                                <img
                                                    src={b.cover_image_r2_key}
                                                    alt=""
                                                    className="w-20 h-14 rounded-lg object-cover shrink-0 mt-0.5"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[15px] text-[var(--text-primary)] font-semibold group-hover:text-[var(--text-primary)] transition-colors leading-snug">
                                                    {b.title || "Untitled"}
                                                </p>
                                                {b.subtitle && (
                                                    <p className="text-[13px] text-[var(--text-muted)] mt-1 line-clamp-1">
                                                        {b.subtitle}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-faint)]">
                                                    {b.read_time_minutes >
                                                        0 && (
                                                        <span className="flex items-center gap-1">
                                                            <ion-icon
                                                                name="time-outline"
                                                                style={{
                                                                    fontSize:
                                                                        "12px",
                                                                }}
                                                            />
                                                            {
                                                                b.read_time_minutes
                                                            }{" "}
                                                            min read
                                                        </span>
                                                    )}
                                                    {b.published_at && (
                                                        <span>
                                                            {formatUtcDate(
                                                                b.published_at,
                                                                {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    year: "numeric",
                                                                },
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border-default)] rounded-xl">
                                <ion-icon
                                    name="document-text-outline"
                                    style={{
                                        fontSize: "36px",
                                        color: "#2d3a4d",
                                    }}
                                />
                                <p className="text-[var(--text-faint)] text-[14px] mt-3">
                                    No published blogs yet
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </AppShell>
        );
    }

    return null;
}
