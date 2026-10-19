import { getBlogCanonicalPath } from './blogUrl';
import { notify } from './notify';

const PUBLIC_BLOG_STATUSES = new Set(['published', 'unlisted']);

export function isPublicBlogStatus(status) {
  return PUBLIC_BLOG_STATUSES.has(status);
}

/**
 * Notify pending collaborators only after the reader URL is public.
 * Repeated publish/update requests are safe: notify() deduplicates by
 * recipient, notification type, and blog id.
 */
export async function notifyPendingBlogCollaborators(db, blogId, actorId) {
  const blog = await db.prepare(
    'SELECT author_id, title, status FROM blogs WHERE id = ?'
  ).bind(blogId).first();

  if (!blog || !isPublicBlogStatus(blog.status)) return 0;

  const collaborators = await db.prepare(`
    SELECT user_id
    FROM blog_co_authors
    WHERE blog_id = ? AND status = 'pending'
  `).bind(blogId).all();
  const recipients = collaborators?.results || [];
  if (recipients.length === 0) return 0;

  const effectiveActorId = actorId || blog.author_id;
  const actor = await db.prepare(
    'SELECT username, display_name, avatar_url FROM users WHERE id = ?'
  ).bind(effectiveActorId).first();
  const path = await getBlogCanonicalPath(db, blogId);
  const targetUrl = `${path}${path.includes('?') ? '&' : '?'}invite=${encodeURIComponent(blogId)}`;

  // Repair links created by the previous draft-time behavior. A first publish
  // may change the slug or publication scope after the original invitation.
  await db.prepare(`
    UPDATE notifications
    SET target_title = ?, target_url = ?
    WHERE type = 'blog_invite' AND target_id = ?
  `).bind(blog.title, targetUrl, blogId).run();

  await Promise.all(recipients.map(({ user_id: userId }) => notify(db, {
    userId,
    type: 'blog_invite',
    actorId: effectiveActorId,
    actorName: actor?.display_name || actor?.username,
    actorAvatar: actor?.avatar_url,
    targetId: blogId,
    targetTitle: blog.title,
    targetUrl,
    dedupe: true,
  })));

  return recipients.length;
}
