import { kvCache } from './cache';
import { diversifyBlogs, rankBlogs, stripInternalRecommendationFields } from './recommendations';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function publicStoryPath(story) {
  const owner = story.org?.slug || story.author?.username;
  if (!owner || !story.slug) return null;
  const parts = [owner];
  if (story.org?.slug && story.collection?.slug) parts.push(story.collection.slug);
  parts.push(story.slug);
  return `/${parts.map((part) => encodeURIComponent(part)).join('/')}`;
}

async function queryPublicStories(page, pageSize, recommendationContext = null) {
  const { getDB } = await import('./cloudflare');
  const db = getDB();
  // Rank a fixed four-page window. Pages in the same window share one candidate
  // set, so deterministic personalization never duplicates a story across pages.
  const windowPages = recommendationContext ? 4 : 1;
  const windowIndex = Math.floor((page - 1) / windowPages);
  const offset = windowIndex * pageSize * windowPages;
  const rowLimit = pageSize * windowPages;
  const sliceOffset = recommendationContext ? ((page - 1) % windowPages) * pageSize : 0;

  const [rows, countRow] = await Promise.all([
    db.prepare(`
      SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.cover_image_r2_key,
        b.page_emoji, b.published_at, b.updated_at, b.read_time_minutes,
        b.like_count, b.clap_total, b.comment_count, b.view_count,
        b.author_id, b.published_as, b.language, b.region,
        u.username AS author_username, u.display_name AS author_name,
        u.avatar_url AS author_avatar,
        o.id AS org_id, o.slug AS org_slug, o.name AS org_name,
        o.logo_r2_key AS org_logo,
        c.slug AS collection_slug, c.name AS collection_name
      FROM blogs b
      JOIN users u ON u.id = b.author_id
      LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
      LEFT JOIN collections c ON c.id = b.collection_id
      WHERE b.status = 'published'
        AND b.secret = 0
        AND COALESCE(b.member_only, 0) = 0
        AND LOWER(u.username) != 'selenium-cutlet'
      ORDER BY
        ROW_NUMBER() OVER (PARTITION BY b.author_id ORDER BY b.published_at DESC, b.id DESC),
        b.published_at DESC,
        b.id DESC
      LIMIT ? OFFSET ?
    `).bind(rowLimit, offset).all(),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM blogs b JOIN users u ON u.id = b.author_id
      WHERE b.status = 'published'
        AND b.secret = 0
        AND COALESCE(b.member_only, 0) = 0
        AND LOWER(u.username) != 'selenium-cutlet'
    `).first(),
  ]);

  const stories = rows?.results || [];
  const ids = stories.map((story) => story.id);
  const tagMap = new Map();
  const coAuthorMap = new Map();

  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const [tagRows, coAuthorRows] = await Promise.all([
      db.prepare(`
        SELECT blog_id, tag FROM blog_tags
        WHERE blog_id IN (${placeholders})
        ORDER BY tag
      `).bind(...ids).all(),
      db.prepare(`
        SELECT bc.blog_id, u.username, u.display_name, u.avatar_url
        FROM blog_co_authors bc JOIN users u ON u.id = bc.user_id
        WHERE bc.status = 'accepted' AND bc.blog_id IN (${placeholders})
        ORDER BY bc.added_at
      `).bind(...ids).all(),
    ]);

    for (const row of tagRows?.results || []) {
      if (!tagMap.has(row.blog_id)) tagMap.set(row.blog_id, []);
      tagMap.get(row.blog_id).push(row.tag);
    }
    for (const row of coAuthorRows?.results || []) {
      if (!coAuthorMap.has(row.blog_id)) coAuthorMap.set(row.blog_id, []);
      const authors = coAuthorMap.get(row.blog_id);
      if (authors.length < 10) {
        authors.push({
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
        });
      }
    }
  }

  const total = Number(countRow?.total || 0);
  return {
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    stories: (() => {
      const serialized = stories.map((story) => ({
      id: story.id,
      slug: story.slug,
      title: story.title,
      subtitle: story.subtitle,
      excerpt: story.excerpt,
      cover_image_r2_key: story.cover_image_r2_key,
      page_emoji: story.page_emoji,
      published_at: story.published_at,
      updated_at: story.updated_at,
      read_time_minutes: story.read_time_minutes,
      like_count: story.like_count || 0,
      clap_total: story.clap_total || 0,
      comment_count: story.comment_count || 0,
      view_count: story.view_count || 0,
      author_id: story.author_id,
      published_as: story.published_as,
      language: story.language || 'und',
      region: story.region || 'global',
      author: {
        username: story.author_username,
        display_name: story.author_name,
        avatar_url: story.author_avatar,
      },
      org: story.org_id ? {
        id: story.org_id,
        slug: story.org_slug,
        name: story.org_name,
        logo_url: story.org_logo,
      } : null,
      collection: story.collection_slug ? {
        slug: story.collection_slug,
        name: story.collection_name,
      } : null,
      co_authors: coAuthorMap.get(story.id) || [],
      co_author_count: (coAuthorMap.get(story.id) || []).length,
      tags: tagMap.get(story.id) || [],
      can_edit: false,
      is_author: false,
      is_co_author: false,
      repost_count: 0,
      reposted: false,
      liked: false,
      bookmarked: false,
      }));
      if (!recommendationContext) return serialized;
      return diversifyBlogs(rankBlogs(serialized, recommendationContext))
        .slice(sliceOffset, sliceOffset + pageSize)
        .map(stripInternalRecommendationFields);
    })(),
  };
}

export async function listPublicStories({ page = 1, pageSize = DEFAULT_PAGE_SIZE, recommendationContext = null } = {}) {
  const safePage = clampInt(page, 1, 1, 5000);
  const safePageSize = clampInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  if (recommendationContext) return queryPublicStories(safePage, safePageSize, recommendationContext);
  return kvCache(
    `v2:public-discovery:${safePage}:${safePageSize}`,
    300,
    () => queryPublicStories(safePage, safePageSize),
  );
}
