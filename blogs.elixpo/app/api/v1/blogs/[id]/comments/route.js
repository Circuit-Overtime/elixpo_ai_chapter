export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'comments.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const blog = await db.prepare("SELECT id, secret, status, author_id FROM blogs WHERE id=? AND status IN ('published','unlisted')").bind(id).first();
  if (!blog) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
  if (blog.secret) {
    const team = blog.author_id === auth.userId || await db.prepare("SELECT 1 FROM blog_co_authors WHERE blog_id=? AND user_id=? AND status='accepted'").bind(id, auth.userId).first();
    if (!team) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
  }
  const rows = await db.prepare(`SELECT c.id,c.parent_id,c.content,c.created_at,c.updated_at,
    u.username,u.display_name FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.blog_id=? ORDER BY c.created_at ASC LIMIT 200`).bind(id).all();
  const result = (rows?.results || []).map((row) => blog.secret ? { ...row, username: null, display_name: 'Anonymous' } : row);
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'comments.list', resourceType: 'blog', resourceId: id });
  return apiSuccess(context, result, { headers: rateHeaders });
}

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'comments.create');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 5000) return apiError(context, 'invalid_comment', 'Comment must be 1–5000 characters.', 400, { headers: rateHeaders });
  const blog = await db.prepare("SELECT id, author_id, title, allow_comments, secret FROM blogs WHERE id=? AND status IN ('published','unlisted')").bind(id).first();
  if (!blog) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
  if (!blog.allow_comments) return apiError(context, 'comments_disabled', 'Comments are disabled.', 403, { headers: rateHeaders });
  if (body.parentId) {
    const parent = await db.prepare('SELECT parent_id FROM comments WHERE id=? AND blog_id=?').bind(body.parentId, id).first();
    if (!parent) return apiError(context, 'parent_not_found', 'The parent comment was not found.', 404, { headers: rateHeaders });
    if (parent.parent_id) return apiError(context, 'nested_reply_forbidden', 'Replies can only target a top-level comment.', 400, { headers: rateHeaders });
    const replyCount = await db.prepare('SELECT COUNT(*) AS count FROM comments WHERE parent_id=?').bind(body.parentId).first();
    if ((replyCount?.count || 0) >= 100) return apiError(context, 'reply_limit_reached', 'This comment already has 100 replies.', 409, { headers: rateHeaders });
  }
  const commentId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('INSERT INTO comments (id,blog_id,user_id,parent_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(commentId, id, auth.userId, body.parentId || null, content, now, now),
    db.prepare('UPDATE blogs SET comment_count=comment_count+1 WHERE id=?').bind(id),
  ]);
  try {
    const [{ notify }, { getBlogCanonicalPath }, user] = await Promise.all([
      import('../../../../../../lib/notify'),
      import('../../../../../../lib/blogUrl'),
      db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').bind(auth.userId).first(),
    ]);
    const targetUrl = await getBlogCanonicalPath(db, id);
    const actor = blog.secret
      ? { actorId: null, actorName: 'Anonymous', actorAvatar: null }
      : { actorId: auth.userId, actorName: user?.display_name || user?.username, actorAvatar: user?.avatar_url };
    const notified = new Set([auth.userId]);
    if (blog.author_id !== auth.userId) {
      notified.add(blog.author_id);
      await notify(db, { userId: blog.author_id, type: 'comment', ...actor, targetId: id, targetTitle: blog.title, targetUrl });
    }
    if (body.parentId) {
      const parent = await db.prepare('SELECT user_id FROM comments WHERE id=?').bind(body.parentId).first();
      if (parent && !notified.has(parent.user_id)) {
        notified.add(parent.user_id);
        await notify(db, { userId: parent.user_id, type: 'mention', ...actor, targetId: id, targetTitle: blog.title, targetUrl });
      }
    }
    const usernames = [...new Set([...content.matchAll(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]+)/g)].map((match) => match[1].toLowerCase()))].slice(0, 20);
    if (usernames.length) {
      const placeholders = usernames.map(() => '?').join(',');
      const mentioned = await db.prepare(`SELECT id FROM users WHERE LOWER(username) IN (${placeholders})`).bind(...usernames).all();
      for (const mentionedUser of (mentioned?.results || [])) {
        try { await db.prepare('INSERT OR IGNORE INTO comment_mentions (comment_id,user_id) VALUES (?,?)').bind(commentId, mentionedUser.id).run(); } catch {}
        if (!notified.has(mentionedUser.id)) {
          notified.add(mentionedUser.id);
          await notify(db, { userId: mentionedUser.id, type: 'mention', ...actor, targetId: id, targetTitle: blog.title, targetUrl });
        }
      }
    }
  } catch (notificationError) {
    console.error('[api/v1/comments] notification failed:', notificationError?.name || 'Error');
  }
  try { const { kvInvalidate } = await import('../../../../../../lib/cache'); await kvInvalidate(`v1:interactions:${id}`); } catch {}
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'comments.create', resourceType: 'comment', resourceId: commentId });
  return apiSuccess(context, { id: commentId, blogId: id, parentId: body.parentId || null, createdAt: now }, { status: 201, headers: rateHeaders });
}
