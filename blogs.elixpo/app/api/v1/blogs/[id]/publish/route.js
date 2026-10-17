export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { countBlockWords } from '../../../../../../lib/api/v1/blogInput';
import { blogEntityTag } from '../../../../../../lib/api/v1/entityTag';
import {
  abandonIdempotentOperation,
  beginIdempotentOperation,
  completeIdempotentOperation,
  hashApiRequest,
  recordApiAudit,
} from '../../../../../../lib/api/v1/operations';
import { checkIfMatch } from '../../../../../../lib/api/v1/preconditions';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { getBlogCanonicalPath } from '../../../../../../lib/blogUrl';
import { decompressBlogContent } from '../../../../../../lib/compress';
import { canEditBlog } from '../../../../../../lib/permissions';
import { findProfanity } from '../../../../../../lib/validate';
import { readTimeFromWords } from '../../../../../../lib/readTime';
import { invalidateBlogLifecycleCaches } from '../../../../../../lib/api/v1/blogCache';
import { notifySearchDiscovery } from '../../../../../../lib/searchDiscovery';

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:publish'], 'blogs.publish');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey) return apiError(context, 'idempotency_key_required', 'Idempotency-Key is required.', 400, { headers: rateHeaders });

  try {
    const body = await request.json().catch(() => ({}));
    const targetStatus = body.status || 'published';
    if (!['published', 'unlisted'].includes(targetStatus)) return apiError(context, 'invalid_status', 'status must be published or unlisted.', 400, { headers: rateHeaders });
    const blog = await db.prepare('SELECT * FROM blogs WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!blog || !(await canEditBlog(db, id, auth.userId)).ok) {
      return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    }
    let content;
    try { content = decompressBlogContent(blog.content) || []; } catch { content = []; }
    if (!blog.title?.trim()) return apiError(context, 'title_required', 'A title is required before publishing.', 400, { headers: rateHeaders });
    if (findProfanity(blog.title) || findProfanity(blog.subtitle)) {
      return apiError(context, 'invalid_public_text', 'The title or subtitle contains language that is not allowed.', 400, { headers: rateHeaders });
    }
    if (countBlockWords(content) < 20) {
      return apiError(context, 'content_too_short', 'A post needs at least 20 words before publishing.', 400, { headers: rateHeaders });
    }

    const requestHash = await hashApiRequest({ id, status: targetStatus, etag: request.headers.get('if-match') });
    const reservation = await beginIdempotentOperation(db, {
      userId: auth.userId, operation: 'blogs.publish', key: idempotencyKey, requestHash,
    });
    if (reservation.state === 'replay') {
      return apiSuccess(context, reservation.body.data, { status: reservation.status, headers: { ...rateHeaders, 'Idempotent-Replayed': 'true' } });
    }
    const precondition = await checkIfMatch(request, blog);
    if (!precondition.ok) {
      await abandonIdempotentOperation(db, {
        userId: auth.userId, operation: 'blogs.publish', key: idempotencyKey, requestHash,
      });
      return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, {
        details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current },
      });
    }
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE blogs SET status = ?, published_at = COALESCE(published_at, ?),
        read_time_minutes = ?, updated_at = ? WHERE id = ?
    `).bind(targetStatus, now, readTimeFromWords(countBlockWords(content)), now, id).run();
    const updated = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    const etag = await blogEntityTag(updated);
    const path = await getBlogCanonicalPath(db, id);
    const result = { id, slug: updated.slug, status: targetStatus, updatedAt: now, etag, url: `https://blogs.elixpo.com${path}` };
    await completeIdempotentOperation(db, {
      userId: auth.userId, operation: 'blogs.publish', key: idempotencyKey, requestHash,
      status: 200, body: { data: result },
    });
    try {
      const { snapshotVersion } = await import('../../../../../../lib/blogVersions');
      await snapshotVersion(db, id, updated.content, { label: 'published', userId: auth.userId });
    } catch {}
    try {
      const { notifyPendingBlogCollaborators } = await import('../../../../../../lib/blogInviteNotifications');
      await notifyPendingBlogCollaborators(db, id, updated.author_id);
    } catch {}
    await invalidateBlogLifecycleCaches(id);
    if (targetStatus === 'published') notifySearchDiscovery(result.url);
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'blogs.publish', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, result, { headers: { ...rateHeaders, ETag: etag } });
  } catch (error) {
    if (error?.name === 'IdempotencyError') return apiError(context, error.code, error.message, error.status, { headers: rateHeaders });
    console.error('[api/v1/blogs] publish failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be published.', 500, { headers: rateHeaders });
  }
}
