export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { blogEntityTag } from '../../../../../../lib/api/v1/entityTag';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { checkIfMatch } from '../../../../../../lib/api/v1/preconditions';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { presentBlogVersion } from '../../../../../../lib/blogVersions';
import { canEditBlog } from '../../../../../../lib/permissions';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'blogs.versions.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  if (!(await canEditBlog(db, id, auth.userId)).ok) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });

  const versionId = new URL(request.url).searchParams.get('version');
  if (versionId) {
    const version = await db.prepare(`SELECT v.*, u.username, u.display_name
      FROM blog_versions v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.id=? AND v.blog_id=? LIMIT 1`).bind(versionId, id).first();
    if (!version) return apiError(context, 'version_not_found', 'The version was not found.', 404, { headers: rateHeaders });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'blogs.versions.get', resourceType: 'blog_version', resourceId: versionId });
    return apiSuccess(context, presentBlogVersion(version, { includeContent: true }), { headers: rateHeaders });
  }

  const rows = await db.prepare(`SELECT v.id, v.content, v.label, v.created_at, v.created_by,
    u.username, u.display_name FROM blog_versions v LEFT JOIN users u ON u.id=v.created_by
    WHERE v.blog_id=? ORDER BY v.created_at DESC LIMIT 50`).bind(id).all();
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'blogs.versions.list', resourceType: 'blog', resourceId: id });
  return apiSuccess(context, (rows?.results || []).map((row) => presentBlogVersion(row)), { headers: rateHeaders });
}

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'blogs.versions.restore');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const blog = await db.prepare('SELECT * FROM blogs WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!blog || !(await canEditBlog(db, id, auth.userId)).ok) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
  const precondition = await checkIfMatch(request, blog);
  if (!precondition.ok) return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, { details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current } });
  const body = await request.json().catch(() => ({}));
  const version = await db.prepare('SELECT content FROM blog_versions WHERE id=? AND blog_id=?').bind(body.versionId, id).first();
  if (!version) return apiError(context, 'version_not_found', 'The version was not found.', 404, { headers: rateHeaders });
  const { snapshotVersion } = await import('../../../../../../lib/blogVersions');
  await snapshotVersion(db, id, blog.content, { label: 'pre-cli-restore', userId: auth.userId });
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE blogs SET content=?, updated_at=? WHERE id=?').bind(version.content, now, id).run();
  const updated = await db.prepare('SELECT * FROM blogs WHERE id=?').bind(id).first();
  const etag = await blogEntityTag(updated);
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'blogs.versions.restore', resourceType: 'blog', resourceId: id });
  return apiSuccess(context, { id, versionId: body.versionId, updatedAt: now, etag }, { headers: { ...rateHeaders, ETag: etag } });
}
