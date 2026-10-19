import { sanitizeSlug } from './slugify.js';

export const COLLECTION_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
export const BLOG_LICENSES = new Set([
  'all-rights-reserved',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'cc-by-nc-4.0',
  'cc0-1.0',
]);

export function collectionSlug(value) {
  return sanitizeSlug(value, { max: 48 });
}

export function curatedCoverUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (url.length > 2048) throw new Error('invalid_cover_url');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('invalid_cover_url');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('invalid_cover_url');
  }
  return parsed.toString();
}

export function serializeCuratedCollection(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    introduction: row.introduction || '',
    coverUrl: row.cover_url || null,
    visibility: row.visibility || (row.is_public ? 'public' : 'private'),
    count: Number(row.entry_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOwnedCollection(db, id, userId) {
  if (!id || !userId) return null;
  return db.prepare(`
    SELECT bc.*,
      (SELECT COUNT(*) FROM curated_collection_entries ce WHERE ce.collection_id = bc.id) AS entry_count
    FROM bookmark_collections bc
    WHERE bc.id = ? AND bc.user_id = ?
  `).bind(id, userId).first();
}

export async function getVisibleCollection(db, { id, username, slug, viewerId } = {}) {
  const ownerFilter = id
    ? 'bc.id = ?'
    : 'LOWER(u.username) = LOWER(?) AND LOWER(bc.slug) = LOWER(?)';
  const values = id ? [id] : [username || '', slug || ''];
  const row = await db.prepare(`
    SELECT bc.*, u.username AS owner_username, u.display_name AS owner_name,
      u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM curated_collection_entries ce WHERE ce.collection_id = bc.id) AS entry_count
    FROM bookmark_collections bc
    JOIN users u ON u.id = bc.user_id
    WHERE ${ownerFilter}
    LIMIT 1
  `).bind(...values).first();
  if (!row) return null;
  const visibility = row.visibility || (row.is_public ? 'public' : 'private');
  if (row.user_id !== viewerId && visibility === 'private') return null;
  return row;
}

export function publicBlogHref(blog) {
  if (blog.org_slug) {
    return blog.publication_collection_slug
      ? `/${blog.org_slug}/${blog.publication_collection_slug}/${blog.slug}`
      : `/${blog.org_slug}/${blog.slug}`;
  }
  return `/${blog.author_username}/${blog.slug}`;
}

export function serializeCuratedEntry(row) {
  return {
    blogId: row.blog_id,
    slug: row.slug,
    title: row.title || 'Untitled',
    subtitle: row.subtitle || '',
    excerpt: row.excerpt || '',
    coverUrl: row.cover_image_r2_key || null,
    emoji: row.page_emoji || '',
    readTimeMinutes: Number(row.read_time_minutes || 0),
    publishedAt: row.published_at,
    updatedAt: row.blog_updated_at,
    author: {
      id: row.author_id,
      username: row.author_username,
      displayName: row.author_name || row.author_username,
      avatarUrl: row.author_avatar || null,
    },
    canonicalUrl: publicBlogHref(row),
    license: row.license || 'all-rights-reserved',
    curatorNote: row.curator_note || '',
    category: row.category || '',
    position: Number(row.position || 0),
    addedAt: row.added_at,
  };
}

export const CURATED_ENTRY_SELECT = `
  SELECT ce.collection_id, ce.blog_id, ce.position, ce.curator_note, ce.category,
    ce.added_at, b.slug, b.title, b.subtitle, b.excerpt, b.cover_image_r2_key,
    b.page_emoji, b.read_time_minutes, b.published_at, b.updated_at AS blog_updated_at,
    b.author_id, b.license, u.username AS author_username,
    u.display_name AS author_name, u.avatar_url AS author_avatar,
    o.slug AS org_slug, pc.slug AS publication_collection_slug
  FROM curated_collection_entries ce
  JOIN blogs b ON b.id = ce.blog_id
  JOIN users u ON u.id = b.author_id
  LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
  LEFT JOIN collections pc ON pc.id = b.collection_id
`;
