export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { STAFF_ORG_ID } from '../../../lib/staff';
import { diversifyBlogs, loadRecommendationContext, rankBlogs, stripInternalRecommendationFields } from '../../../lib/recommendations';

const BLOG_FIELDS = `b.id, b.slug, b.secret, b.title, b.subtitle, b.excerpt, b.cover_image_r2_key, b.page_emoji,
  b.author_id, b.published_as, b.published_at, b.read_time_minutes,
  b.like_count, b.clap_total, b.comment_count, b.view_count, b.language, b.region`;

// Secret blogs must never appear in an author-derived feed bucket. "Posts by people
// you follow" would tell a reader the author is someone they follow — with a small
// following list that is a full deanonymization. They still reach readers through the
// author-neutral buckets (trending / recent / interests / tag) with the byline stripped.
const EXCLUDE_SECRET = ' AND b.secret = 0';

// Keep the test author ("selenium-cutlet") out of every feed surface.
const EXCLUDE_TEST = " AND b.author_id NOT IN (SELECT id FROM users WHERE LOWER(username) = 'selenium-cutlet')";
const MAX_FEED_CANDIDATES = 200;

/**
 * GET /api/feed — personalized feed
 *
 * Query params:
 *   ?page=1&limit=20
 *   ?filter=following  — only followed users/orgs
 *   ?tag=AI            — filter by specific tag
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 40) : 20;
  // Blended feeds rank a bounded candidate window in memory. Do not accept a
  // page whose offset is beyond that window, or a valid request deterministically
  // turns into an empty page while more stories still exist.
  const maxPage = Math.max(1, Math.floor(MAX_FEED_CANDIDATES / limit));
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), maxPage) : 1;
  const filterType = searchParams.get('filter') || '';
  const filterTag = searchParams.get('tag') || '';
  const offset = (page - 1) * limit;

  const session = await getSession().catch(() => null);
  const userId = session?.userId;

  try {
    // Cache anonymous feeds (shared across all anonymous users)
    if (!userId) {
      const { kvCache } = await import('../../../lib/cache');
      const anonymousLanguage = String(request.headers.get('accept-language') || 'und').split(',')[0].split('-')[0].toLowerCase();
      const anonymousRegion = String(request.headers.get('cf-ipcountry') || 'global').toUpperCase();
      const cacheKey = filterTag
        ? `v1:feed:anon:tag:${filterTag}:p${page}`
        : filterType === 'featured'
        ? `v1:feed:anon:featured:p${page}`
        : `v3:feed:anon:recommended:${anonymousLanguage}:${anonymousRegion}:p${page}`;

      const cached = await kvCache(cacheKey, 180, async () => {
        const { getDB } = await import('../../../lib/cloudflare');
        const db = getDB();
        const now = Math.floor(Date.now() / 1000);
        let posts = filterTag
          ? await queryByTag(db, filterTag, now, limit, offset)
          : filterType === 'featured'
          ? backfill(await queryFeatured(db, now, limit, offset), await queryTrending(db, now, limit, offset), limit)
          : await queryRecommendedAnonymous(db, request.headers, now, limit, offset);
        // Recency fallback so the public feed isn't empty when posts are older than the trending window.
        if (!filterTag && posts.length < limit) {
          const recent = await queryRecent(db, limit, offset);
          const have = new Set(posts.map(p => p.id));
          for (const post of recent) {
            if (posts.length >= limit) break;
            if (!have.has(post.id)) { have.add(post.id); posts.push(post); }
          }
        }
        posts = await enrichPosts(db, posts, null);
        return { posts, page, hasMore: posts.length === limit };
      });
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    let posts;

    if (filterType === 'following') {
      posts = await queryFollowing(db, userId, now, limit, offset);
    } else if (filterType === 'featured') {
      posts = await queryFeatured(db, now, limit, offset);
      if (posts.length < limit) posts = backfill(posts, await queryTrending(db, now, limit, offset), limit);
    } else if (filterTag) {
      posts = await queryByTag(db, filterTag, now, limit, offset);
    } else {
      posts = await queryBlended(db, userId, request.headers, now, limit, offset);
    }

    posts = await enrichPosts(db, posts, userId);
    // hasMore reflects the unmuted page: muting removes rows after paging,
    // so measuring after filterMuted would end pagination early.
    const hasMore = posts.length === limit;
    posts = await filterMuted(db, userId, posts);

    return NextResponse.json({
      posts,
      page,
      hasMore,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Feed error:', e?.message || e);
    return NextResponse.json({ posts: [], page, hasMore: false });
  }
}

// ─── Bucket A: Following ─────────────────────────────────────────────
async function queryFollowing(db, userId, now, limit, offset) {
  const cutoff = now - 30 * 86400;
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST}${EXCLUDE_SECRET} AND b.published_at > ?
      AND (
        b.author_id IN (SELECT following_id FROM follows WHERE follower_id = ? AND following_type = 'user')
        OR b.published_as IN (
          SELECT 'org:' || following_id FROM follows WHERE follower_id = ? AND following_type = 'org'
        )
        OR b.id IN (
          SELECT blog_id FROM blog_co_authors
          WHERE status = 'accepted'
            AND user_id IN (SELECT following_id FROM follows WHERE follower_id = ? AND following_type = 'user')
        )
      )
    ORDER BY
      ROW_NUMBER() OVER (PARTITION BY b.author_id ORDER BY b.published_at DESC, b.id DESC),
      b.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(cutoff, userId, userId, userId, limit, offset).all();
  return result?.results || [];
}

// ─── Reposts by people you follow (surfaced in the Following bucket) ──
async function queryFollowedReposts(db, userId, now, limit) {
  const cutoff = now - 30 * 86400;
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}, r.user_id AS reshared_by_id, r.created_at AS reshared_at
    FROM reposts r
    JOIN blogs b ON b.id = r.blog_id
    WHERE r.user_id IN (SELECT following_id FROM follows WHERE follower_id = ? AND following_type = 'user')
      AND b.status = 'published'${EXCLUDE_TEST}${EXCLUDE_SECRET}
      AND b.author_id != ?
      AND r.created_at > ?
    ORDER BY r.created_at DESC
    LIMIT ?
  `).bind(userId, userId, cutoff, limit).all();
  return result?.results || [];
}

// ─── Bucket B: Interest-matched (explicit picks + implicit taste signals) ──
async function queryInterests(db, userId, now, limit) {
  const cutoff = now - 14 * 86400;
  const signalCutoff = now - 30 * 86400;
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST} AND b.published_at > ?
      AND b.id IN (
        SELECT blog_id FROM blog_tags WHERE LOWER(tag) IN (
          SELECT LOWER(tag) FROM user_interests WHERE user_id = ?
          UNION
          SELECT DISTINCT LOWER(tag) FROM user_signals WHERE user_id = ? AND tag IS NOT NULL AND weight > 0 AND created_at > ?
        )
      )
      AND b.author_id != ?
    ORDER BY
      ROW_NUMBER() OVER (PARTITION BY b.author_id ORDER BY b.published_at DESC, b.id DESC),
      b.published_at DESC
    LIMIT ?
  `).bind(cutoff, userId, userId, signalCutoff, userId, limit).all();
  return result?.results || [];
}

// ─── Bucket C: Trending ──────────────────────────────────────────────
async function queryTrending(db, now, limit, offset) {
  const cutoff = now - 14 * 86400;
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST} AND b.published_at > ?
    ORDER BY
      ROW_NUMBER() OVER (
        PARTITION BY b.author_id
        ORDER BY b.like_count DESC, b.view_count DESC, b.published_at DESC
      ),
      b.like_count DESC,
      b.view_count DESC,
      b.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(cutoff, limit, offset).all();
  return result?.results || [];
}

// ─── Featured: editorial / staff-org picks (newest first) ────────────
async function queryFeatured(db, now, limit, offset) {
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST}
      AND b.published_as = ?
    ORDER BY
      ROW_NUMBER() OVER (PARTITION BY b.author_id ORDER BY b.published_at DESC, b.id DESC),
      b.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(`org:${STAFF_ORG_ID}`, limit, offset).all();
  return result?.results || [];
}

// Top up `base` with items from `extra` (deduped) until it reaches `limit`.
function backfill(base, extra, limit) {
  const have = new Set(base.map(p => p.id));
  for (const p of extra) {
    if (base.length >= limit) break;
    if (!have.has(p.id)) { have.add(p.id); base.push(p); }
  }
  return base;
}

// ─── Tag-filtered ────────────────────────────────────────────────────
async function queryByTag(db, tag, now, limit, offset) {
  const cutoff = now - 30 * 86400;
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST} AND b.published_at > ?
      AND b.id IN (SELECT blog_id FROM blog_tags WHERE LOWER(tag) = LOWER(?))
    ORDER BY b.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(cutoff, tag, limit, offset).all();
  return result?.results || [];
}

// ─── Recency fallback: most recent published posts (no tight time cutoff) ──
async function queryRecent(db, limit, offset = 0) {
  const result = await db.prepare(`
    SELECT ${BLOG_FIELDS}
    FROM blogs b
    WHERE b.status = 'published'${EXCLUDE_TEST}
    ORDER BY
      ROW_NUMBER() OVER (PARTITION BY b.author_id ORDER BY b.published_at DESC, b.id DESC),
      b.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  return result?.results || [];
}

// ─── Blended feed (3 buckets merged in JS) ───────────────────────────
async function queryBlended(db, userId, headers, now, limit, offset = 0) {
  const candidateLimit = Math.min(MAX_FEED_CANDIDATES, Math.max(40, offset + limit * 3));
  const [reposts, following, interests, trending, recent] = await Promise.all([
    queryFollowedReposts(db, userId, now, candidateLimit),
    queryFollowing(db, userId, now, candidateLimit, 0),
    queryInterests(db, userId, now, candidateLimit),
    queryTrending(db, now, candidateLimit, 0),
    queryRecent(db, candidateLimit, 0),
  ]);

  // Deduplicate by ID. Reposts go FIRST so a post reshared by someone you follow
  // claims the slot (carrying reshared_by_id) and gets top priority.
  const seen = new Set();
  const all = [];
  for (const post of [...reposts, ...following, ...interests, ...trending, ...recent]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);

      all.push({
        ...post,
        _reshared: !!post.reshared_by_id,
        _followed: following.some(candidate => candidate.id === post.id),
      });
    }
  }

  await attachCandidateTags(db, all);
  const context = await loadRecommendationContext(db, userId, headers);
  const eligible = await filterMuted(db, userId, all);
  const ranked = diversifyBlogs(rankBlogs(eligible, context, { now }))
    .slice(offset, offset + limit)
    .map(stripInternalRecommendationFields);

  return ranked;
}

async function queryRecommendedAnonymous(db, headers, now, limit, offset) {
  const candidateLimit = Math.min(MAX_FEED_CANDIDATES, Math.max(60, offset + limit * 4));
  const recent = await queryRecent(db, candidateLimit, 0);
  await attachCandidateTags(db, recent);
  const context = await loadRecommendationContext(db, null, headers);
  return diversifyBlogs(rankBlogs(recent, context, { now }))
    .slice(offset, offset + limit)
    .map(stripInternalRecommendationFields);
}

async function attachCandidateTags(db, posts) {
  if (!posts.length) return posts;
  const tags = await batchQuery(db, 'SELECT blog_id, tag FROM blog_tags WHERE blog_id IN', posts.map(post => post.id));
  const tagMap = new Map();
  for (const row of tags) {
    if (!tagMap.has(row.blog_id)) tagMap.set(row.blog_id, []);
    tagMap.get(row.blog_id).push(row.tag);
  }
  for (const post of posts) post.tags = tagMap.get(post.id) || [];
  return posts;
}

// ─── Enrich posts with author, tags, permissions ────────────────────
async function enrichPosts(db, posts, userId) {
  if (posts.length === 0) return posts;

  const authorIds = [...new Set([...posts.map(p => p.author_id), ...posts.filter(p => p.reshared_by_id).map(p => p.reshared_by_id)])];
  const blogIds = posts.map(p => p.id);

  const [authors, tags] = await Promise.all([
    batchQuery(db, 'SELECT id, username, display_name, avatar_url FROM users WHERE id IN', authorIds),
    batchQuery(db, 'SELECT blog_id, tag FROM blog_tags WHERE blog_id IN', blogIds),
  ]);

  // Fetch accepted co-authors (with display info) for multi-author bylines.
  const coAuthorsMap = {};
  if (blogIds.length > 0) {
    const placeholders = blogIds.map(() => '?').join(',');
    const caResult = await db.prepare(
      `SELECT bc.blog_id, u.username, u.display_name, u.avatar_url
       FROM blog_co_authors bc JOIN users u ON u.id = bc.user_id
       WHERE bc.blog_id IN (${placeholders}) AND bc.status = 'accepted'
       ORDER BY bc.added_at`
    ).bind(...blogIds).all();
    for (const row of (caResult?.results || [])) {
      if (!coAuthorsMap[row.blog_id]) coAuthorsMap[row.blog_id] = [];
      if (coAuthorsMap[row.blog_id].length < 10) {
        coAuthorsMap[row.blog_id].push({
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
        });
      }
    }
  }

  const authorMap = Object.fromEntries(authors.map(a => [a.id, a]));
  const tagMap = {};
  for (const t of tags) {
    if (!tagMap[t.blog_id]) tagMap[t.blog_id] = [];
    tagMap[t.blog_id].push(t.tag);
  }

  // Fetch org names for posts published under an org
  const orgIds = [...new Set(posts.filter(p => p.published_as?.startsWith('org:')).map(p => p.published_as.replace('org:', '')))];
  const orgMap = {};
  if (orgIds.length > 0) {
    const orgs = await batchQuery(db, 'SELECT id, slug, name, logo_r2_key FROM orgs WHERE id IN', orgIds);
    for (const o of orgs) orgMap[o.id] = o;
  }

  let orgMemberSet = new Set();
  if (userId && orgIds.length > 0) {
    const memberRows = await batchQuery(db, "SELECT org_id || ':' || user_id as key FROM org_members WHERE role IN ('admin','maintain','write') AND user_id = ? AND org_id IN", orgIds, [userId]);
    orgMemberSet = new Set(memberRows.map(r => r.key));
  }

  // Reshare counts for these posts (batched).
  const repostMap = {};
  if (blogIds.length) {
    const ph = blogIds.map(() => '?').join(',');
    const rows = await db.prepare(`SELECT blog_id, COUNT(*) AS c FROM reposts WHERE blog_id IN (${ph}) GROUP BY blog_id`).bind(...blogIds).all();
    for (const r of (rows?.results || [])) repostMap[r.blog_id] = r.c;
  }

  // The viewer's like / bookmark / co-author / repost state for these posts (batched).
  let likedSet = new Set(), bookmarkedSet = new Set(), coAuthoredSet = new Set(), repostedSet = new Set();
  if (userId) {
    const [likeRows, bmRows, caRows, rpRows] = await Promise.all([
      batchQuery(db, 'SELECT blog_id FROM likes WHERE user_id = ? AND blog_id IN', blogIds, [userId]),
      batchQuery(db, 'SELECT blog_id FROM bookmarks WHERE user_id = ? AND blog_id IN', blogIds, [userId]),
      batchQuery(db, "SELECT blog_id FROM blog_co_authors WHERE status = 'accepted' AND user_id = ? AND blog_id IN", blogIds, [userId]),
      batchQuery(db, 'SELECT blog_id FROM reposts WHERE user_id = ? AND blog_id IN', blogIds, [userId]),
    ]);
    likedSet = new Set(likeRows.map(r => r.blog_id));
    bookmarkedSet = new Set(bmRows.map(r => r.blog_id));
    coAuthoredSet = new Set(caRows.map(r => r.blog_id));
    repostedSet = new Set(rpRows.map(r => r.blog_id));
  }

  // Lazily backfill excerpts for posts published before the excerpt column
  // existed (compute once from content, write through).
  const needEx = posts.filter(p => !p.excerpt);
  if (needEx.length) {
    try {
      const ids = needEx.map(p => p.id);
      const ph = ids.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id, content FROM blogs WHERE id IN (${ph})`).bind(...ids).all();
      const cmap = Object.fromEntries((rows?.results || []).map(r => [r.id, r.content]));
      const { decompressBlogContent } = await import('../../../lib/compress');
      const { excerptFromBlocks } = await import('../../../lib/excerpt');
      const updates = [];
      for (const p of needEx) {
        try {
          const raw = cmap[p.id];
          if (!raw) continue;
          let blocks = decompressBlogContent(raw);
          if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch { blocks = []; } }
          const ex = excerptFromBlocks(Array.isArray(blocks) ? blocks : []);
          if (ex) { p.excerpt = ex; updates.push(db.prepare('UPDATE blogs SET excerpt = ? WHERE id = ?').bind(ex, p.id)); }
        } catch {}
      }
      if (updates.length) await db.batch(updates);
    } catch {}
  }

  return posts.map(p => {
    const secret = !!p.secret;
    const isAuthor = userId && p.author_id === userId;
    const orgId = p.published_as?.startsWith('org:') ? p.published_as.replace('org:', '') : null;
    const isOrgMember = orgId && orgMemberSet.has(`${orgId}:${userId}`);
    const org = orgId ? orgMap[orgId] || null : null;
    const coAuthors = coAuthorsMap[p.id] || [];
    // A secret blog's author never travels to a reader: drop author_id from the
    // payload and hand back an anonymous byline instead of the real one.
    const base = { ...p };
    if (secret) delete base.author_id;
    return {
      ...base,
      author: secret
        ? { username: null, display_name: 'Anonymous', avatar_url: null }
        : (authorMap[p.author_id] || { username: 'unknown', display_name: 'Unknown' }),
      org: org ? { id: org.id, slug: org.slug, name: org.name, logo_url: org.logo_r2_key } : null,
      co_authors: secret ? [] : coAuthors,
      co_author_count: secret ? 0 : coAuthors.length,
      tags: tagMap[p.id] || [],
      is_staff: p.published_as === `org:${STAFF_ORG_ID}`,
      can_edit: !!(isAuthor || isOrgMember),
      is_author: !!isAuthor,
      is_co_author: coAuthoredSet.has(p.id),
      repost_count: repostMap[p.id] || 0,
      reposted: repostedSet.has(p.id),
      reshared_by: p.reshared_by_id ? (authorMap[p.reshared_by_id] || null) : null,
      liked: likedSet.has(p.id),
      bookmarked: bookmarkedSet.has(p.id),
    };
  });
}

// ─── Drop posts the user has muted (author / org / tag) ──────────────
async function filterMuted(db, userId, posts) {
  if (!posts.length) return posts;
  let mutes;
  try {
    mutes = await db.prepare('SELECT target_type, target_id FROM mutes WHERE user_id = ?').bind(userId).all();
  } catch { return posts; } // mutes table not migrated yet
  const rows = mutes?.results || [];
  if (rows.length === 0) return posts;
  const mutedAuthors = new Set(rows.filter(r => r.target_type === 'author').map(r => r.target_id));
  const mutedOrgs = new Set(rows.filter(r => r.target_type === 'org').map(r => r.target_id));
  const mutedTags = new Set(rows.filter(r => r.target_type === 'tag').map(r => r.target_id.toLowerCase()));
  return posts.filter(p => {
    // Never apply an author mute to a secret blog: "mute X and watch the post
    // disappear" is an oracle that reveals the author to anyone willing to test it.
    if (!p.secret && mutedAuthors.has(p.author_id)) return false;
    const orgId = p.published_as?.startsWith('org:') ? p.published_as.slice(4) : null;
    if (orgId && mutedOrgs.has(orgId)) return false;
    if ((p.tags || []).some(t => mutedTags.has((t || '').toLowerCase()))) return false;
    return true;
  });
}

// ─── Batch query helper ──────────────────────────────────────────────
async function batchQuery(db, queryPrefix, ids, extraBinds = []) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`${queryPrefix} (${placeholders})`).bind(...extraBinds, ...ids).all();
  return result?.results || [];
}
