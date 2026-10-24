// Blog version-history helpers (#11 E). Snapshots store the same compressed
// content format as blogs.content.

import { decompressBlogContent } from './compress';
import { excerptFromBlocks } from './excerpt';
import { countBlockWords } from './api/v1/blogInput';

const MAX_VERSIONS_PER_BLOG = 30;

export function presentBlogVersion(row, { includeContent = false } = {}) {
  let content = [];
  try {
    const parsed = decompressBlogContent(row?.content);
    if (Array.isArray(parsed)) content = parsed;
  } catch {}

  return {
    id: row.id,
    label: row.label || 'autosave',
    created_at: row.created_at,
    created_by: row.created_by || null,
    username: row.username || null,
    display_name: row.display_name || null,
    excerpt: excerptFromBlocks(content),
    word_count: countBlockWords(content),
    ...(includeContent ? { content } : {}),
  };
}

/**
 * Record a version snapshot. Best-effort — never throws to the caller.
 * @param {D1Database} db
 * @param {string} blogId
 * @param {string} compressedContent  already-compressed content (lz1:…)
 * @param {object} [opts]
 * @param {string} [opts.label]            'autosave' | 'published' | …
 * @param {string} [opts.userId]
 * @param {number} [opts.throttleSeconds]  skip if a snapshot exists newer than this
 */
export async function snapshotVersion(db, blogId, compressedContent, opts = {}) {
  if (!db || !blogId || !compressedContent) return;
  try {
    const now = Math.floor(Date.now() / 1000);
    const last = await db.prepare(
      'SELECT content, created_at FROM blog_versions WHERE blog_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
    ).bind(blogId).first();
    if (last?.content === compressedContent) return;
    if (opts.throttleSeconds && last && now - last.created_at < opts.throttleSeconds) return;

    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO blog_versions (id, blog_id, content, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, blogId, compressedContent, opts.label || 'autosave', opts.userId || null, now).run();

    // Trim to the newest N.
    await db.prepare(`
      DELETE FROM blog_versions
      WHERE blog_id = ? AND id NOT IN (
        SELECT id FROM blog_versions WHERE blog_id = ? ORDER BY created_at DESC LIMIT ?
      )
    `).bind(blogId, blogId, MAX_VERSIONS_PER_BLOG).run();
  } catch (e) {
    console.warn('snapshotVersion failed:', e?.message || e);
  }
}
