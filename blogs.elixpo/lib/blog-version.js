/**
 * Blog version control — tracks publish state and prevents race conditions.
 *
 * Every blog has:
 *   - updated_at: last edit timestamp (draft changes)
 *   - published_at: last publish timestamp
 *
 * Version states:
 *   - 'draft'     → never published (status = 'draft')
 *   - 'published'  → published and up to date (updated_at <= published_at)
 *   - 'ahead'     → local edits ahead of published version (updated_at > published_at)
 *   - 'behind'    → upstream has newer changes (someone else updated)
 *   - 'conflict'  → both local and upstream changed since last sync
 */

/**
 * Get the version state of a blog for the current editor.
 *
 * @param {object} blog - Blog row from DB { status, updated_at, published_at }
 * @param {number} localUpdatedAt - The updated_at the editor last saw
 * @returns {{ state: string, publishedAt: number, updatedAt: number }}
 */
export function getVersionState(blog, localUpdatedAt) {
  if (!blog) return { state: 'draft', publishedAt: 0, updatedAt: 0 };

  const { status, updated_at, published_at } = blog;

  if (status === 'draft') {
    return { state: 'draft', publishedAt: 0, updatedAt: updated_at };
  }

  // Check if upstream has been modified since our last known version
  if (localUpdatedAt && updated_at > localUpdatedAt) {
    return { state: 'behind', publishedAt: published_at, updatedAt: updated_at };
  }

  // Published and draft is ahead
  if (updated_at > published_at) {
    return { state: 'ahead', publishedAt: published_at, updatedAt: updated_at };
  }

  return { state: 'published', publishedAt: published_at, updatedAt: updated_at };
}

/**
 * Check if it's safe to publish — returns false if upstream is newer.
 *
 * @param {D1Database} db
 * @param {string} blogId
 * @param {number} lastKnownUpdatedAt - The updated_at timestamp the editor loaded
 * @returns {Promise<{ safe: boolean, currentVersion: number, conflict: boolean }>}
 */
export async function checkPublishSafety(db, blogId, lastKnownUpdatedAt) {
  const blog = await db.prepare('SELECT updated_at, published_at, status FROM blogs WHERE id = ?')
    .bind(blogId).first();

  if (!blog) return { safe: false, currentVersion: 0, conflict: false };

  // If no lastKnownUpdatedAt provided, always allow (first publish)
  if (!lastKnownUpdatedAt) return { safe: true, currentVersion: blog.updated_at, conflict: false };

  // If upstream has been modified by someone else since we loaded
  if (blog.updated_at > lastKnownUpdatedAt) {
    return { safe: false, currentVersion: blog.updated_at, conflict: true };
  }

  return { safe: true, currentVersion: blog.updated_at, conflict: false };
}

/**
 * Get version info for API response — attach to draft GET and sync status checks.
 */
export async function getBlogVersionInfo(db, blogId) {
  const blog = await db.prepare(
    'SELECT status, updated_at, published_at FROM blogs WHERE id = ?'
  ).bind(blogId).first();

  if (!blog) return null;

  return {
    status: blog.status,
    updatedAt: blog.updated_at,
    publishedAt: blog.published_at || 0,
    isPublished: blog.status === 'published',
    isDraftAhead: blog.status === 'published' && blog.updated_at > (blog.published_at || 0),
  };
}
