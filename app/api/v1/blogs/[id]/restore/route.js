export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { blogEntityTag } from '../../../../../../lib/api/v1/entityTag';
import { isBlogOwner } from '../../../../../../lib/api/v1/blogInput';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { checkIfMatch } from '../../../../../../lib/api/v1/preconditions';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { invalidateBlogLifecycleCaches } from '../../../../../../lib/api/v1/blogCache';
import { getBlogCanonicalPath } from '../../../../../../lib/blogUrl';
import { notifySearchDiscovery } from '../../../../../../lib/searchDiscovery';

const RESTORABLE = new Set(['draft', 'published', 'unlisted']);

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:delete'], 'blogs.restore');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const blog = await db.prepare('SELECT * FROM blogs WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first();
    if (!blog || !(await isBlogOwner(db, blog, auth.userId))) {
      return apiError(context, 'blog_not_found', 'The trashed blog was not found.', 404, { headers: rateHeaders });
    }
    const precondition = await checkIfMatch(request, blog);
    if (!precondition.ok) {
      return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, {
        details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current },
      });
    }
    const status = RESTORABLE.has(blog.pre_delete_status) ? blog.pre_delete_status : 'draft';
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE blogs SET status = ?, deleted_at = NULL, pre_delete_status = NULL, updated_at = ? WHERE id = ?
    `).bind(status, now, id).run();
    const updated = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    const etag = await blogEntityTag(updated);
    if (status !== 'draft') await invalidateBlogLifecycleCaches(id);
    if (status === 'published') {
      notifySearchDiscovery(`https://blogs.elixpo.com${await getBlogCanonicalPath(db, id)}`);
    }
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'blogs.restore', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, { id, status, restored: true, updatedAt: now, etag }, { headers: { ...rateHeaders, ETag: etag } });
  } catch (error) {
    console.error('[api/v1/blogs] restore failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be restored.', 500, { headers: rateHeaders });
  }
}
