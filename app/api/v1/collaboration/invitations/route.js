export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:collaboration:read'], 'collaboration.invitations.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  try {
    const rows = await db.prepare(`
      SELECT c.blog_id, c.role, c.status, c.show_on_profile, c.added_at,
        b.title, b.slug, b.status AS blog_status,
        u.username AS author_username, u.display_name AS author_name
      FROM blog_co_authors c
      JOIN blogs b ON b.id = c.blog_id AND b.deleted_at IS NULL
      JOIN users u ON u.id = b.author_id
      WHERE c.user_id = ?
      ORDER BY c.added_at DESC
    `).bind(auth.userId).all();
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'collaboration.invitations.list', resourceType: 'blog_collaborator',
    });
    return apiSuccess(context, (rows?.results || []).map((row) => ({
      blogId: row.blog_id,
      title: row.title || 'Untitled blog',
      slug: row.slug,
      role: row.role,
      status: row.status,
      showOnProfile: Boolean(row.show_on_profile),
      invitedAt: row.added_at,
      author: { username: row.author_username, displayName: row.author_name || row.author_username },
      notificationState: ['published', 'unlisted'].includes(row.blog_status) ? 'available' : 'deferred_until_publish',
    })), { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaboration] invitations failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Collaboration invitations could not be listed.', 500, { headers: rateHeaders });
  }
}

export async function POST(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:collaboration:write'], 'collaboration.invitations.resolve');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  try {
    const body = await request.json();
    const blogId = String(body?.blogId || '');
    const action = String(body?.action || '');
    if (!blogId || !['accept', 'decline'].includes(action)) {
      return apiError(context, 'invalid_invitation_action', 'blogId and action accept or decline are required.', 400, { headers: rateHeaders });
    }
    const invitation = await db.prepare('SELECT status FROM blog_co_authors WHERE blog_id = ? AND user_id = ?').bind(blogId, auth.userId).first();
    if (!invitation) return apiError(context, 'invitation_not_found', 'The invitation was not found.', 404, { headers: rateHeaders });
    if (action === 'accept') {
      const showOnProfile = body?.showOnProfile === false ? 0 : 1;
      await db.prepare("UPDATE blog_co_authors SET status = 'accepted', show_on_profile = ? WHERE blog_id = ? AND user_id = ?").bind(showOnProfile, blogId, auth.userId).run();
    } else {
      await db.prepare('DELETE FROM blog_co_authors WHERE blog_id = ? AND user_id = ?').bind(blogId, auth.userId).run();
    }
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: `collaboration.invitations.${action}`, resourceType: 'blog_collaborator', resourceId: `${blogId}:${auth.userId}`,
    });
    return apiSuccess(context, { blogId, status: action === 'accept' ? 'accepted' : 'declined' }, { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaboration] resolve failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The invitation could not be resolved.', 500, { headers: rateHeaders });
  }
}
