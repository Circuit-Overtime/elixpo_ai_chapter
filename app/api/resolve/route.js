export const runtime = "edge";

import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { decompressBlogContent } from "../../../lib/compress";
import { STAFF_ORG_ID } from "../../../lib/staff";
import { getLimits } from "../../../lib/tiers";

// Accepted co-authors (max 10) with display info for multi-author bylines.
async function fetchCoAuthors(db, blogId) {
    const res = await db
        .prepare(`
    SELECT u.username, u.display_name, u.designation, u.avatar_url, bc.role
    FROM blog_co_authors bc JOIN users u ON u.id = bc.user_id
    WHERE bc.blog_id = ? AND bc.status = 'accepted'
    ORDER BY bc.added_at LIMIT 10
  `)
        .bind(blogId)
        .all();
    return (res?.results || []).map((c) => ({
        username: c.username,
        display_name: c.display_name,
        designation: c.designation,
        avatar_url: c.avatar_url,
        role: c.role,
    }));
}

// A secret blog's author is never exposed to readers. Strip every identifying
// field server-side rather than trusting the client to hide them — the row still
// carries author_id in D1 so a reported blog can be traced internally by slugid.
// Listings must link secret blogs by slugid: /@name/slug would name the author.
async function enforceMemberGating(db, blog) {
    if (!blog || !blog.member_only) return blog;
    const session = await getSession();
    let canRead = false;
    if (session?.userId) {
        const me = await db
            .prepare("SELECT tier FROM users WHERE id = ?")
            .bind(session.userId)
            .first();
        canRead = getLimits(me?.tier).canReadMemberOnly;
        if (!canRead && blog.id) {
            const { canEditBlog } = await import("../../../lib/permissions");
            canRead = (await canEditBlog(db, blog.id, session.userId)).ok;
            if (!canRead) {
                const invitedViewer = await db
                    .prepare(
                        "SELECT 1 FROM blog_co_authors WHERE blog_id = ? AND user_id = ? AND status = 'accepted'",
                    )
                    .bind(blog.id, session.userId)
                    .first();
                canRead = !!invitedViewer;
            }
        }
    }
    if (!canRead) {
        blog.paywalled = true;
        // Never return full blocks to a gated reader. "First two blocks" is not a
        // safe teaser because one paragraph/code block can contain the whole post.
        const teaser =
            typeof blog.excerpt === "string" ? blog.excerpt.trim() : "";
        blog.content = teaser
            ? [
                  {
                      type: "paragraph",
                      props: {},
                      content: [{ type: "text", text: teaser, styles: {} }],
                      children: [],
                  },
              ]
            : [];
    }
    return blog;
}

function stripSecretAuthor(blog) {
    if (!blog || !blog.secret) return blog;
    const {
        author_id,
        author_username,
        author_name,
        author_designation,
        author_avatar,
        author_tier,
        co_authors,
        co_author_count,
        ...safe
    } = blog;
    return { ...safe, secret: 1, co_authors: [], co_author_count: 0 };
}

function decompressBlog(blog) {
    if (!blog) return blog;
    try {
        blog.content = decompressBlogContent(blog.content);
    } catch {
        // If decompression fails, try parsing as raw JSON
        try {
            blog.content = JSON.parse(blog.content);
        } catch {
            /* leave as-is */
        }
    }
    return blog;
}

// Short link (/[slugid]) — the only route that can serve a secret blog, since it
// names no author in the path. Public posts permanently redirect to their single
// canonical owner URL so search engines never see two indexable copies.
async function fetchBlogBySlugid(db, slugid) {
    const blog = await db
        .prepare(`
    SELECT b.*, u.username as author_username, u.display_name as author_name,
      u.designation as author_designation,
      u.avatar_url as author_avatar, u.tier as author_tier
    FROM blogs b JOIN users u ON u.id = b.author_id
    WHERE b.id = ? AND b.status IN ('published', 'unlisted')
  `)
        .bind(slugid)
        .first();
    if (!blog) return null;

    const [tags, coAuthors] = await Promise.all([
        db
            .prepare("SELECT tag FROM blog_tags WHERE blog_id = ?")
            .bind(blog.id)
            .all(),
        fetchCoAuthors(db, blog.id),
    ]);
    const full = {
        ...decompressBlog(blog),
        tags: (tags?.results || []).map((t) => t.tag),
        co_authors: coAuthors,
        co_author_count: coAuthors.length,
    };

    // Owner resolution. A secret blog must never name the person who wrote it, and
    // for a personal post the owner *is* the author — so we return no owner at all.
    // An org-published secret blog still shows the org: an org is not an individual,
    // and publishing under a banner is the point of the feature.
    let owner = null;
    if (
        typeof full.published_as === "string" &&
        full.published_as.startsWith("org:")
    ) {
        const org = await db
            .prepare(
                "SELECT id, slug, name, tagline, description, bio, logo_url, logo_r2_key, owner_id, updated_at FROM orgs WHERE id = ?",
            )
            .bind(full.published_as.slice(4))
            .first();
        if (org) owner = { type: "org", ...org };
    } else if (!full.secret) {
        const u = await db
            .prepare(
                "SELECT id, username, display_name, avatar_url, bio, tier FROM users WHERE id = ?",
            )
            .bind(full.author_id)
            .first();
        if (u) owner = { type: "user", ...u };
    }

    if (!full.secret && owner && full.slug) {
        const parts = [owner.slug || owner.username];
        if (full.collection_id && owner.type === "org") {
            const collection = await db
                .prepare(
                    "SELECT slug FROM collections WHERE id = ? AND org_id = ?",
                )
                .bind(full.collection_id, owner.id)
                .first();
            if (collection?.slug) parts.push(collection.slug);
        }
        parts.push(full.slug);
        return {
            type: "redirect",
            location: `/${parts.map((part) => encodeURIComponent(part)).join("/")}`,
        };
    }

    return {
        type: "blog",
        owner,
        blog: await enforceMemberGating(db, stripSecretAuthor(full)),
    };
}

// Resolve @name to user or org, optionally fetch a blog by slug
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    // Blog ids are case-sensitive, usernames/slugs are not — keep both forms.
    const rawName = (searchParams.get("name") || "").trim();
    const name = rawName.toLowerCase();
    const slug = (searchParams.get("slug") || "").trim().toLowerCase();
    const collection = (searchParams.get("collection") || "")
        .trim()
        .toLowerCase();

    if (!name) {
        return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    try {
        const { getDB } = await import("../../../lib/cloudflare");
        const db = getDB();

        // Check namespace to determine type
        const ns = await db
            .prepare(
                "SELECT owner_type, owner_id FROM namespaces WHERE name = ?",
            )
            .bind(name)
            .first();

        let ownerType = ns?.owner_type;
        let ownerId = ns?.owner_id;

        // Fallback: the namespace row may be missing if seeding failed at signup
        // (the callback reserves the name in a best-effort try/catch). Resolve
        // straight from the source tables so the profile still loads, then
        // self-heal the namespace so future lookups hit the fast path.
        if (!ns) {
            // Keep old profile and personal-blog links valid after Accounts changes
            // the username. This table is introduced in migration 0039; tolerate it
            // being absent during a staggered deployment.
            try {
                const alias = await db
                    .prepare(`
          SELECT u.username
          FROM username_aliases a JOIN users u ON u.id = a.user_id
          WHERE a.username = ?
        `)
                    .bind(name)
                    .first();
                if (alias?.username && alias.username !== name) {
                    const suffix = [collection, slug].filter(Boolean).join("/");
                    return NextResponse.json({
                        type: "redirect",
                        location: `/${alias.username}${suffix ? `/${suffix}` : ""}`,
                    });
                }
            } catch {
                /* migration may not be applied yet */
            }

            const u = await db
                .prepare("SELECT id FROM users WHERE LOWER(username) = ?")
                .bind(name)
                .first();
            if (u) {
                ownerType = "user";
                ownerId = u.id;
            } else {
                const o = await db
                    .prepare("SELECT id FROM orgs WHERE LOWER(slug) = ?")
                    .bind(name)
                    .first();
                if (o) {
                    ownerType = "org";
                    ownerId = o.id;
                }
            }

            // No namespace match → try the short link /[slugid]. Namespaces are resolved
            // first, so an existing username or org slug can never be shadowed by a blog id.
            if (!ownerType) {
                if (!slug) {
                    const short = await fetchBlogBySlugid(db, rawName);
                    if (short) return NextResponse.json(short);
                }
                return NextResponse.json(
                    { error: "Not found", type: null },
                    { status: 404 },
                );
            }

            try {
                await db
                    .prepare(
                        "INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id, created_at) VALUES (?, ?, ?, unixepoch())",
                    )
                    .bind(name, ownerType, ownerId)
                    .run();
            } catch {
                /* best-effort backfill */
            }
        }

        // Resolve profile
        if (ownerType === "user") {
            const user = await db
                .prepare(`
        SELECT id, username, display_name, designation, bio, avatar_url, banner_r2_key,
          location, timezone, pronouns, website, company, links, tier, created_at, updated_at
        FROM users WHERE id = ?
      `)
                .bind(ownerId)
                .first();

            if (!user)
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 },
                );

            // If slug requested, find the blog
            if (slug) {
                const blog = await db
                    .prepare(`
          SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.content, b.cover_image_r2_key,
            b.cover_pos_x, b.cover_pos_y, b.cover_zoom, b.member_only,
            b.status, b.published_as, b.page_emoji, b.read_time_minutes,
            b.published_at, b.created_at, b.updated_at, b.author_id,
            u.username as author_username, u.display_name as author_name, u.designation as author_designation,
            u.avatar_url as author_avatar, u.tier as author_tier
          FROM blogs b
          JOIN users u ON u.id = b.author_id
          WHERE LOWER(b.slug) = ? AND b.author_id = ? AND b.status IN ('published', 'unlisted')
            AND (b.published_as = 'personal' OR b.published_as IS NULL)
            AND b.secret = 0
        `)
                    .bind(slug, ownerId)
                    .first();

                if (!blog)
                    return NextResponse.json(
                        { error: "Blog not found" },
                        { status: 404 },
                    );

                // Fetch tags + co-author count
                const [tags, coAuthorRow] = await Promise.all([
                    db
                        .prepare("SELECT tag FROM blog_tags WHERE blog_id = ?")
                        .bind(blog.id)
                        .all(),
                    fetchCoAuthors(db, blog.id),
                ]);

                return NextResponse.json({
                    type: "blog",
                    owner: { type: "user", ...user },
                    blog: await enforceMemberGating(db, {
                        ...decompressBlog(blog),
                        tags: (tags?.results || []).map((t) => t.tag),
                        co_authors: coAuthorRow,
                        co_author_count: coAuthorRow.length,
                    }),
                });
            }

            // Profile blogs = own posts + blogs they're an accepted co-author on
            // (cross-posted). The author_username/slug come from the *primary* author
            // so the blog still links to its canonical /owner/slug URL.
            const blogs = await db
                .prepare(`
        SELECT b.id, b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji,
          b.read_time_minutes, b.published_at, b.status, b.author_id, b.published_as,
          COALESCE(b.like_count, 0) AS like_count,
          COALESCE(b.comment_count, 0) AS comment_count,
          au.username AS author_username,
          po.slug AS org_slug, pc.slug AS collection_slug,
          (b.author_id = ?) AS is_owner
        FROM blogs b
        JOIN users au ON au.id = b.author_id
        LEFT JOIN orgs po ON ('org:' || po.id) = b.published_as
        LEFT JOIN collections pc ON pc.id = b.collection_id
        WHERE (b.author_id = ? OR b.id IN (
                 SELECT blog_id FROM blog_co_authors WHERE user_id = ? AND status = 'accepted' AND show_on_profile = 1
               ))
          AND b.status = 'published'
          -- Secret blogs never appear on a profile: listing them here would tie
          -- the anonymous post straight back to its author (or a co-author).
          AND b.secret = 0
        ORDER BY b.published_at DESC LIMIT 20
      `)
                .bind(ownerId, ownerId, ownerId)
                .all();

            const followerCount = await db
                .prepare(
                    "SELECT COUNT(*) as c FROM follows WHERE following_id = ? AND following_type = 'user'",
                )
                .bind(ownerId)
                .first();

            const followingCount = await db
                .prepare(
                    "SELECT COUNT(*) as c FROM follows WHERE follower_id = ?",
                )
                .bind(ownerId)
                .first();

            // Public profiles expose only creator-approved badges. Missing migration
            // is tolerated during rolling deployments.
            let badges = [];
            try {
                const { listUserBadges } = await import(
                    "../../../lib/creatorBadges"
                );
                badges = await listUserBadges(db, ownerId);
            } catch {}
            try {
                const honors = await db.prepare(`
                  SELECT c.id AS contest_id, c.slug, c.title, a.placement, a.position, a.awarded_at
                  FROM contest_awards a
                  JOIN contest_submissions s ON s.id = a.submission_id
                  JOIN contests c ON c.id = a.contest_id
                  WHERE s.author_id = ? AND c.status = 'completed' AND s.withdrawn_at IS NULL
                  ORDER BY a.awarded_at DESC LIMIT 20
                `).bind(ownerId).all();
                badges.push(...(honors?.results || []).map((honor) => ({
                    id: `contest-${honor.contest_id}-${honor.placement}-${honor.position}`,
                    name: honor.placement === 'winner' ? `${honor.title} Winner` : `${honor.title} ${honor.placement}`,
                    description: `Recognized as ${honor.placement}${honor.position > 1 ? ` #${honor.position}` : ''} in ${honor.title}.`,
                    category: 'Contest recognition',
                    difficulty: 'Awarded',
                    icon: 'trophy-outline',
                    artwork: null,
                    awarded_at: honor.awarded_at,
                    source_url: `/contests/${honor.slug}`,
                })));
            } catch {}

            // Tag frequency for topic filter chips on the redesigned profile page.
            let tags = [];
            try {
                const tagResult = await db
                    .prepare(`
          SELECT bt.tag, COUNT(*) as count
          FROM blog_tags bt JOIN blogs b ON b.id = bt.blog_id
          WHERE b.author_id = ? AND b.status = 'published' AND b.secret = 0
          GROUP BY bt.tag ORDER BY count DESC LIMIT 20
        `)
                    .bind(ownerId)
                    .all();
                tags = (tagResult?.results || []).map((t) => ({
                    tag: t.tag,
                    count: t.count,
                }));
            } catch {}

            // Public organization memberships make @org references in a creator's
            // bio and company field verifiable and linkable. Private memberships
            // are deliberately omitted from the public profile response.
            let organizations = [];
            try {
                const orgResult = await db
                    .prepare(`
          SELECT DISTINCT o.id, o.slug, o.name
          FROM orgs o
          LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
          WHERE o.visibility != 'private' AND (o.owner_id = ? OR om.user_id IS NOT NULL)
          ORDER BY LOWER(o.name) ASC
        `)
                    .bind(ownerId, ownerId)
                    .all();
                organizations = orgResult?.results || [];
            } catch {}

            return NextResponse.json({
                type: "user",
                user: {
                    ...user,
                    followers: followerCount?.c || 0,
                    following: followingCount?.c || 0,
                    badges,
                },
                blogs: blogs?.results || [],
                tags,
                organizations,
            });
        }

        if (ownerType === "org") {
            const org = await db
                .prepare(`
        SELECT id, slug, name, tagline, description, bio, website, links, visibility,
          logo_url, logo_r2_key, banner_url, banner_r2_key, featured_blog_ids,
          timezone, location, contact_email, owner_id, created_at, updated_at
        FROM orgs WHERE id = ?
      `)
                .bind(ownerId)
                .first();

            if (!org)
                return NextResponse.json(
                    { error: "Org not found" },
                    { status: 404 },
                );

            // Custom links from the dedicated table (name + url), newest schema wins
            // over the legacy JSON `links` column when present.
            try {
                const lk = await db
                    .prepare(
                        "SELECT name, url FROM org_links WHERE org_id = ? ORDER BY position",
                    )
                    .bind(org.id)
                    .all();
                if ((lk?.results || []).length) {
                    org.links = JSON.stringify(
                        lk.results.map((l) => ({
                            label: l.name,
                            url: l.url,
                            type: "website",
                        })),
                    );
                }
            } catch {}

            // If collection + slug, find blog in collection
            if (collection && slug) {
                const col = await db
                    .prepare(
                        "SELECT id FROM collections WHERE org_id = ? AND LOWER(slug) = ?",
                    )
                    .bind(ownerId, collection)
                    .first();
                if (!col)
                    return NextResponse.json(
                        { error: "Collection not found" },
                        { status: 404 },
                    );

                const blog = await db
                    .prepare(`
          SELECT b.*, u.username as author_username, u.display_name as author_name,
            u.designation as author_designation, u.avatar_url as author_avatar, u.tier as author_tier
          FROM blogs b JOIN users u ON u.id = b.author_id
          WHERE LOWER(b.slug) = ? AND b.collection_id = ? AND b.status IN ('published', 'unlisted')
            AND b.secret = 0
        `)
                    .bind(slug, col.id)
                    .first();

                if (!blog)
                    return NextResponse.json(
                        { error: "Blog not found" },
                        { status: 404 },
                    );

                const [tags, coAuthorRow] = await Promise.all([
                    db
                        .prepare("SELECT tag FROM blog_tags WHERE blog_id = ?")
                        .bind(blog.id)
                        .all(),
                    fetchCoAuthors(db, blog.id),
                ]);
                return NextResponse.json({
                    type: "blog",
                    owner: { type: "org", ...org },
                    collection: { id: col.id, slug: collection },
                    blog: await enforceMemberGating(db, {
                        ...decompressBlog(blog),
                        tags: (tags?.results || []).map((t) => t.tag),
                        co_authors: coAuthorRow,
                        co_author_count: coAuthorRow.length,
                    }),
                });
            }

            // If just slug (no collection), check if it's a collection first, then a blog
            if (slug) {
                // Check if slug matches a collection under this org
                const col = await db
                    .prepare(
                        "SELECT id, slug, name, description FROM collections WHERE org_id = ? AND LOWER(slug) = ?",
                    )
                    .bind(ownerId, slug)
                    .first();

                if (col) {
                    // Return collection listing with its blogs
                    const colBlogs = await db
                        .prepare(`
            SELECT b.id, b.slug, b.slugid, b.secret, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji,
              b.read_time_minutes, b.published_at, b.author_id,
              u.username as author_username, u.display_name as author_name, u.designation as author_designation,
              u.avatar_url as author_avatar, u.tier as author_tier, b.member_only,
              (SELECT COUNT(*) FROM likes WHERE blog_id = b.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE blog_id = b.id) as comment_count
            FROM blogs b JOIN users u ON u.id = b.author_id
            WHERE b.collection_id = ? AND b.status = 'published'
            ORDER BY b.published_at DESC LIMIT 50
          `)
                        .bind(col.id)
                        .all();

                    // Fetch tags for each blog
                    const blogIds = (colBlogs?.results || []).map((b) => b.id);
                    const tagMap = {};
                    if (blogIds.length > 0) {
                        const placeholders = blogIds.map(() => "?").join(",");
                        const tagResult = await db
                            .prepare(
                                `SELECT blog_id, tag FROM blog_tags WHERE blog_id IN (${placeholders})`,
                            )
                            .bind(...blogIds)
                            .all();
                        for (const t of tagResult?.results || []) {
                            if (!tagMap[t.blog_id]) tagMap[t.blog_id] = [];
                            tagMap[t.blog_id].push(t.tag);
                        }
                    }

                    return NextResponse.json({
                        type: "collection",
                        owner: { type: "org", ...org },
                        collection: col,
                        blogs: (colBlogs?.results || []).map((b) =>
                            stripSecretAuthor({
                                ...b,
                                tags: tagMap[b.id] || [],
                            }),
                        ),
                    });
                }

                // Otherwise treat as a blog slug
                const blog = await db
                    .prepare(`
          SELECT b.*, u.username as author_username, u.display_name as author_name,
            u.designation as author_designation, u.avatar_url as author_avatar, u.tier as author_tier
          FROM blogs b JOIN users u ON u.id = b.author_id
          WHERE LOWER(b.slug) = ? AND b.published_as = ? AND b.status IN ('published', 'unlisted')
            AND b.secret = 0
        `)
                    .bind(slug, `org:${ownerId}`)
                    .first();

                if (!blog)
                    return NextResponse.json(
                        { error: "Blog not found" },
                        { status: 404 },
                    );

                const [tags, coAuthorRow] = await Promise.all([
                    db
                        .prepare("SELECT tag FROM blog_tags WHERE blog_id = ?")
                        .bind(blog.id)
                        .all(),
                    fetchCoAuthors(db, blog.id),
                ]);
                return NextResponse.json({
                    type: "blog",
                    owner: { type: "org", ...org },
                    blog: await enforceMemberGating(db, {
                        ...decompressBlog(blog),
                        tags: (tags?.results || []).map((t) => t.tag),
                        co_authors: coAuthorRow,
                        co_author_count: coAuthorRow.length,
                    }),
                });
            }

            // Org profile — fetch owner, members, collections, blogs
            const [owner, members, collections, blogs] = await Promise.all([
                db
                    .prepare(`
          SELECT id, username, display_name, avatar_url, bio, tier, created_at
          FROM users WHERE id = ?
        `)
                    .bind(org.owner_id)
                    .first(),
                db
                    .prepare(`
          SELECT u.id, u.username, u.display_name, u.avatar_url, om.role, om.joined_at
          FROM org_members om JOIN users u ON u.id = om.user_id
          WHERE om.org_id = ? ORDER BY om.joined_at LIMIT 50
        `)
                    .bind(ownerId)
                    .all(),
                db
                    .prepare(
                        "SELECT id, slug, name, description FROM collections WHERE org_id = ? ORDER BY created_at",
                    )
                    .bind(ownerId)
                    .all(),
                db
                    .prepare(`
          SELECT b.id, b.slug, b.slugid, b.secret, b.title, b.subtitle, b.cover_image_r2_key,
            b.page_emoji, b.read_time_minutes, b.published_at, b.published_as,
            c.slug AS collection_slug
          FROM blogs b LEFT JOIN collections c ON c.id = b.collection_id
          WHERE b.published_as = ? AND b.status = 'published'
          ORDER BY published_at DESC LIMIT 20
        `)
                    .bind(`org:${ownerId}`)
                    .all(),
            ]);

            return NextResponse.json({
                type: "org",
                org,
                owner: owner || null,
                members: members?.results || [],
                collections: collections?.results || [],
                blogs: blogs?.results || [],
            });
        }

        return NextResponse.json({ error: "Unknown type" }, { status: 500 });
    } catch (e) {
        console.error("Resolve error:", e?.message || e);
        const isDbError =
            e?.message?.includes("D1_ERROR") || e?.message?.includes("SQLITE");
        return NextResponse.json(
            { error: isDbError ? "Service unavailable" : "Not found" },
            { status: isDbError ? 503 : 404 },
        );
    }
}
