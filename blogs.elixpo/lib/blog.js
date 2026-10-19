/**
 * Resolve a blog by its ID (slugid).
 * Blog IDs in this app are the `id` column directly.
 */
export async function getBlogById(db, blogId) {
  return db.prepare('SELECT id, slug, title, author_id, published_as, status, allow_comments FROM blogs WHERE id = ?')
    .bind(blogId).first();
}

/**
 * Hash an IP address for anonymous view tracking.
 */
export async function hashIP(ip) {
  if (!ip) return null;
  const data = new TextEncoder().encode(ip + ':lixblogs-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
