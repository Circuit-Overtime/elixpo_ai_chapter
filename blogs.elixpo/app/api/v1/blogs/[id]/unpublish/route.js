export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { blogEntityTag } from '../../../../../../lib/api/v1/entityTag';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { checkIfMatch } from '../../../../../../lib/api/v1/preconditions';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { canEditBlog } from '../../../../../../lib/permissions';
import { invalidateBlogLifecycleCaches } from '../../../../../../lib/api/v1/blogCache';
import { getBlogCanonicalPath } from '../../../../../../lib/blogUrl';
import { notifySearchDiscovery } from '../../../../../../lib/searchDiscovery';

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:publish'], 'blogs.unpublish');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const blog = await db.prepare('SELECT * FROM blogs WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!blog || !(await canEditBlog(db, id, auth.userId)).ok) {
      return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    }
    const precondition = await checkIfMatch(request, blog);
    if (!precondition.ok) {
      return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, {
        details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current },
      });
    }
    const publicUrl = `https://blogs.elixpo.com${await getBlogCanonicalPath(db, id)}`;
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE blogs SET status = 'draft', updated_at = ? WHERE id = ?").bind(now, id).run();
    const updated = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    const etag = await blogEntityTag(updated);
    await invalidateBlogLifecycleCaches(id);
    notifySearchDiscovery(publicUrl);
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'blogs.unpublish', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, { id, status: 'draft', updatedAt: now, etag }, { headers: { ...rateHeaders, ETag: etag } });
  } catch (error) {
    console.error('[api/v1/blogs] unpublish failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be unpublished.', 500, { headers: rateHeaders });
  }
}
