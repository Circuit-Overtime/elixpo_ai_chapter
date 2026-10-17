export const runtime = "edge";

import { NextResponse } from "next/server";

/**
 * GET /api/users/[username]/posts
 *
 * Paginated public post API for the redesigned profile page.
 * Supports filtering, sorting, tag-based filtering, and text search.
 *
 * Query params:
 *   filter  — all (default) | newest | popular | oldest | collections | coauthored
 *   cursor  — pagination cursor (published_at:id)
 *   limit   — results per page (default 10, max 50)
 *   q       — search query (title/subtitle)
 *   tag     — filter by tag name
 */
export async function GET(request, { params }) {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";
    const cursor = searchParams.get("cursor") || "";
    const limit = Math.min(
        Math.max(Number(searchParams.get("limit")) || 10, 1),
        50,
    );
    const query = (searchParams.get("q") || "").trim().slice(0, 200);
    const tag = (searchParams.get("tag") || "").trim().toLowerCase();

    if (!username) {
        return NextResponse.json(
            { error: "Missing username" },
            { status: 400 },
        );
    }

    try {
        const { getDB } = await import("../../../../../lib/cloudflare");
        const db = getDB();

        // Resolve user
        const user = await db
            .prepare("SELECT id FROM users WHERE LOWER(username) = ?")
            .bind(username.toLowerCase())
            .first();

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }

        // Parse cursor
        let cursorAt = null;
        let cursorId = null;
        if (cursor) {
            const parts = cursor.split(":");
            if (parts.length === 2) {
                cursorAt = Number(parts[0]);
                cursorId = parts[1];
            }
        }

        // Build query based on filter
        let orderBy = "b.published_at DESC, b.id DESC";
        let cursorCond = "";
        const binds = [];

        if (filter === "oldest") {
            orderBy = "b.published_at ASC, b.id ASC";
        } else if (filter === "popular") {
            orderBy =
                "(COALESCE(b.like_count, 0) + COALESCE(b.comment_count, 0)) DESC, b.published_at DESC";
        }

        // Base conditions: visible public posts
        let baseWhere = `b.status = 'published' AND b.secret = 0`;
        let fromClause = "FROM blogs b JOIN users au ON au.id = b.author_id";

        if (filter === "coauthored") {
            // Posts where this user is a co-author (not the primary author)
            fromClause += ` JOIN blog_co_authors bca ON bca.blog_id = b.id AND bca.user_id = ? AND bca.status = 'accepted' AND bca.show_on_profile = 1`;
            binds.push(user.id);
            baseWhere += " AND b.author_id != ?";
            binds.push(user.id);
        } else if (filter === "collections") {
            // Posts in collections
            baseWhere +=
                " AND b.collection_id IS NOT NULL AND (b.author_id = ? OR b.id IN (SELECT blog_id FROM blog_co_authors WHERE user_id = ? AND status = 'accepted' AND show_on_profile = 1))";
            binds.push(user.id, user.id);
        } else {
            // Own posts + co-authored cross-posts
            baseWhere +=
                " AND (b.author_id = ? OR b.id IN (SELECT blog_id FROM blog_co_authors WHERE user_id = ? AND status = 'accepted' AND show_on_profile = 1))";
            binds.push(user.id, user.id);
        }

        // Tag filter
        if (tag) {
            baseWhere +=
                " AND b.id IN (SELECT blog_id FROM blog_tags WHERE LOWER(tag) = ?)";
            binds.push(tag);
        }

        // Text search
        if (query) {
            baseWhere += " AND (b.title LIKE ? OR b.subtitle LIKE ?)";
            const like = `%${query}%`;
            binds.push(like, like);
        }

        // Cursor pagination
        if (cursorAt !== null && cursorId) {
            if (filter === "oldest") {
                cursorCond =
                    " AND (b.published_at > ? OR (b.published_at = ? AND b.id > ?))";
            } else if (filter === "popular") {
                // For popular, cursor is by score:id — but simpler to use offset for now
                // Popular sort doesn't work well with keyset pagination, use published_at as tiebreaker
                cursorCond =
                    " AND (b.published_at < ? OR (b.published_at = ? AND b.id < ?))";
            } else {
                cursorCond =
                    " AND (b.published_at < ? OR (b.published_at = ? AND b.id < ?))";
            }
            binds.push(cursorAt, cursorAt, cursorId);
        }

        const sql = `
      SELECT b.id, b.slug, b.title, b.subtitle, b.cover_image_r2_key, b.page_emoji,
        b.read_time_minutes, b.published_at, b.status, b.author_id, b.published_as,
        b.collection_id, COALESCE(b.like_count, 0) as like_count,
        COALESCE(b.comment_count, 0) as comment_count,
        au.username AS author_username, au.display_name AS author_name,
        au.avatar_url AS author_avatar,
        po.slug AS org_slug, pc.slug AS collection_slug
      ${fromClause}
      LEFT JOIN orgs po ON ('org:' || po.id) = b.published_as
      LEFT JOIN collections pc ON pc.id = b.collection_id
      WHERE ${baseWhere}${cursorCond}
      ORDER BY ${orderBy}
      LIMIT ?
    `;
        binds.push(limit + 1); // fetch one extra to detect if there are more

        const result = await db
            .prepare(sql)
            .bind(...binds)
            .all();
        const rows = result?.results || [];
        const hasMore = rows.length > limit;
        const posts = hasMore ? rows.slice(0, limit) : rows;

        // Build next cursor
        let nextCursor = null;
        if (hasMore && posts.length > 0) {
            const last = posts[posts.length - 1];
            nextCursor = `${last.published_at}:${last.id}`;
        }

        // Fetch tags for returned posts
        const postIds = posts.map((p) => p.id);
        const tagMap = {};
        if (postIds.length > 0) {
            const placeholders = postIds.map(() => "?").join(",");
            const tagResult = await db
                .prepare(
                    `SELECT blog_id, tag FROM blog_tags WHERE blog_id IN (${placeholders})`,
                )
                .bind(...postIds)
                .all();
            for (const t of tagResult?.results || []) {
                if (!tagMap[t.blog_id]) tagMap[t.blog_id] = [];
                tagMap[t.blog_id].push(t.tag);
            }
        }

        return NextResponse.json({
            posts: posts.map((p) => ({
                id: p.id,
                slug: p.slug,
                title: p.title,
                subtitle: p.subtitle,
                cover_image_r2_key: p.cover_image_r2_key,
                page_emoji: p.page_emoji,
                read_time_minutes: p.read_time_minutes,
                published_at: p.published_at,
                like_count: p.like_count,
                comment_count: p.comment_count,
                author_username: p.author_username,
                author_name: p.author_name,
                author_avatar: p.author_avatar,
                org_slug: p.org_slug,
                collection_slug: p.collection_slug,
                published_as: p.published_as,
                tags: tagMap[p.id] || [],
            })),
            nextCursor,
            hasMore,
        });
    } catch (e) {
        console.error("Posts API error:", e?.message || e);
        return NextResponse.json(
            { error: "Service unavailable" },
            { status: 503 },
        );
    }
}
