export const runtime = "edge";

import { NextResponse } from "next/server";

/**
 * GET /api/users/[username]/contributions?timezone=America/New_York
 *
 * Returns aggregate daily post counts for the last 12 months.
 * Only counts first-publish dates of public/unlisted, non-secret posts.
 * Response shape: { days: { "2026-01-15": 2, ... }, total: 47 }
 *
 * No blog IDs, titles, or slugs are exposed — aggregate counts only.
 */

// Compute the UTC offset in seconds for a given IANA timezone at a reference date.
// Falls back to 0 (UTC) for invalid timezone names.
function timezoneOffsetSeconds(tz) {
    if (!tz || tz === "UTC") return 0;
    try {
        // Get the offset by comparing a formatted date in the target timezone vs UTC.
        const now = new Date();
        const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
        const tzStr = now.toLocaleString("en-US", { timeZone: tz });
        const utcDate = new Date(utcStr);
        const tzDate = new Date(tzStr);
        return Math.round((tzDate - utcDate) / 1000);
    } catch {
        return 0;
    }
}

// Format a unix epoch (seconds) as YYYY-MM-DD in the given timezone offset.
function epochToDateString(epoch, offsetSeconds) {
    const adjusted = (epoch + offsetSeconds) * 1000;
    const d = new Date(adjusted);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export async function GET(request, { params }) {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get("timezone") || "UTC";

    if (!username) {
        return NextResponse.json(
            { error: "Missing username" },
            { status: 400 },
        );
    }

    try {
        const { getDB } = await import("../../../../../lib/cloudflare");
        const db = getDB();

        // Resolve user id from username
        const user = await db
            .prepare("SELECT id, timezone FROM users WHERE LOWER(username) = ?")
            .bind(username.toLowerCase())
            .first();

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }

        // Use the creator's configured timezone if not explicitly provided
        const effectiveTz =
            timezone !== "UTC" ? timezone : user.timezone || "UTC";
        const offsetSec = timezoneOffsetSeconds(effectiveTz);

        // 12 months ago from now
        const now = Math.floor(Date.now() / 1000);
        const oneYearAgo = now - 365 * 24 * 60 * 60;

        // Single aggregate query — no per-cell queries.
        // Fetches all first-published dates for visible posts in the window.
        // D1/SQLite doesn't support timezone-aware DATE(), so we fetch raw epochs
        // and bucket in JS.
        const result = await db
            .prepare(`
      SELECT published_at
      FROM blogs
      WHERE author_id = ?
        AND status IN ('published', 'unlisted')
        AND secret = 0
        AND published_at >= ?
        AND published_at IS NOT NULL
      ORDER BY published_at
    `)
            .bind(user.id, oneYearAgo)
            .all();

        const rows = result?.results || [];

        // Bucket by date in the creator's timezone
        const days = {};
        let total = 0;
        for (const row of rows) {
            if (!row.published_at) continue;
            const dateStr = epochToDateString(row.published_at, offsetSec);
            days[dateStr] = (days[dateStr] || 0) + 1;
            total++;
        }

        // Cache via KV (1 hour TTL)
        try {
            const { kvPut } = await import("../../../../../lib/cache");
            const cacheKey = `v1:contributions:${username.toLowerCase()}`;
            // Fire-and-forget cache write
            kvPut(cacheKey, { days, total }, 3600).catch(() => {});
        } catch {
            // KV unavailable — no-op
        }

        return NextResponse.json({ days, total });
    } catch (e) {
        console.error("Contributions error:", e?.message || e);
        return NextResponse.json(
            { error: "Service unavailable" },
            { status: 503 },
        );
    }
}
