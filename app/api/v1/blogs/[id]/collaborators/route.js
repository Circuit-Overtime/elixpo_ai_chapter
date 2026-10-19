export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { resolveCollaborationAccess, resolveCollaboratorUser, serializeCollaborator } from '../../../../../../lib/api/v1/collaboration';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { getLimits } from '../../../../../../lib/tiers';

const ROLES = new Set(['viewer', 'editor', 'admin']);

async function contextFor(request, params, scopes, action) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, scopes, action);
  if (authorized.response) return { response: authorized.response };
  const { id } = await params;
  if (!id || id.length > 128) {
    return { response: apiError(context, 'invalid_blog_id', 'The blog ID is invalid.', 400, { headers: authorized.rateHeaders }) };
  }
  const access = await resolveCollaborationAccess(authorized.db, id, authorized.auth.userId);
  if (!access.blog || !access.canRead) {
    return { response: apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: authorized.rateHeaders }) };
  }
  return { context, ...authorized, id, access };
}

async function audit(state, action, targetUserId) {
  await recordApiAudit(state.db, {
    requestId: state.context.requestId,
    userId: state.auth.userId,
    clientId: state.auth.clientId,
    action,
    resourceType: 'blog_collaborator',
    resourceId: `${state.id}:${targetUserId || '*'}`,
  });
}

export async function GET(request, { params }) {
  const state = await contextFor(request, params, ['lixblogs:collaboration:read'], 'collaborators.list');
  if (state.response) return state.response;
  try {
    const rows = await state.db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url,
        c.role, c.status, c.show_on_profile, c.added_at
      FROM blog_co_authors c JOIN users u ON u.id = c.user_id
      WHERE c.blog_id = ? ORDER BY c.added_at ASC
    `).bind(state.id).all();
    await audit(state, 'collaborators.list');
    return apiSuccess(state.context, {
      blogId: state.id,
      currentRole: state.access.role,
      canManage: state.access.canManage,
      collaborators: (rows?.results || []).map(serializeCollaborator),
    }, { headers: state.rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaborators] list failed:', error?.message || error);
    return apiError(state.context, 'internal_error', 'Collaborators could not be listed.', 500, { headers: state.rateHeaders });
  }
}

export async function POST(request, { params }) {
  const state = await contextFor(request, params, ['lixblogs:collaboration:write'], 'collaborators.invite');
  if (state.response) return state.response;
  if (!state.access.canManage) {
    return apiError(state.context, 'role_forbidden', 'Only the owner, an organization manager, or an accepted admin collaborator may invite people.', 403, { headers: state.rateHeaders });
  }
  try {
    const body = await request.json();
    const role = String(body?.role || 'viewer');
    if (!ROLES.has(role)) return apiError(state.context, 'invalid_role', 'role must be viewer, editor, or admin.', 400, { headers: state.rateHeaders });
    const invitee = await resolveCollaboratorUser(state.db, body?.user);
    if (!invitee) return apiError(state.context, 'user_not_found', 'The requested user was not found.', 404, { headers: state.rateHeaders });
    if (invitee.id === state.access.blog.author_id) {
      return apiError(state.context, 'author_is_not_collaborator', 'The blog author already owns the post.', 400, { headers: state.rateHeaders });
    }
    const existing = await state.db.prepare('SELECT 1 FROM blog_co_authors WHERE blog_id = ? AND user_id = ?').bind(state.id, invitee.id).first();
    if (!existing) {
      const [owner, count] = await Promise.all([
        state.db.prepare('SELECT tier FROM users WHERE id = ?').bind(state.access.blog.author_id).first(),
        state.db.prepare('SELECT COUNT(*) AS count FROM blog_co_authors WHERE blog_id = ?').bind(state.id).first(),
      ]);
      const limits = getLimits(owner?.tier || 'free');
      if (Number(count?.count || 0) >= limits.coAuthorsPerBlog) {
        return apiError(state.context, 'collaborator_limit_reached', 'The blog has reached its collaborator limit.', 409, { headers: state.rateHeaders });
      }
    }
    await state.db.prepare(`
      INSERT INTO blog_co_authors (blog_id, user_id, role, status, added_at)
      VALUES (?, ?, ?, 'pending', unixepoch())
      ON CONFLICT(blog_id, user_id) DO UPDATE SET role = excluded.role
    `).bind(state.id, invitee.id, role).run();
    try {
      const { notifyPendingBlogCollaborators } = await import('../../../../../../lib/blogInviteNotifications');
      await notifyPendingBlogCollaborators(state.db, state.id, state.auth.userId);
    } catch {}
    await audit(state, 'collaborators.invite', invitee.id);
    return apiSuccess(state.context, { userId: invitee.id, username: invitee.username, role, status: 'pending' }, { status: existing ? 200 : 201, headers: state.rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaborators] invite failed:', error?.message || error);
    return apiError(state.context, 'internal_error', 'The collaborator could not be invited.', 500, { headers: state.rateHeaders });
  }
}

export async function PATCH(request, { params }) {
  const state = await contextFor(request, params, ['lixblogs:collaboration:write'], 'collaborators.role');
  if (state.response) return state.response;
  if (!state.access.canManage) return apiError(state.context, 'role_forbidden', 'You cannot change collaborator roles for this blog.', 403, { headers: state.rateHeaders });
  try {
    const body = await request.json();
    const role = String(body?.role || '');
    if (!ROLES.has(role)) return apiError(state.context, 'invalid_role', 'role must be viewer, editor, or admin.', 400, { headers: state.rateHeaders });
    const target = await resolveCollaboratorUser(state.db, body?.user);
    if (!target) return apiError(state.context, 'user_not_found', 'The requested user was not found.', 404, { headers: state.rateHeaders });
    const result = await state.db.prepare('UPDATE blog_co_authors SET role = ? WHERE blog_id = ? AND user_id = ?').bind(role, state.id, target.id).run();
    if (!result?.meta?.changes) return apiError(state.context, 'collaborator_not_found', 'The collaborator was not found.', 404, { headers: state.rateHeaders });
    await audit(state, 'collaborators.role', target.id);
    return apiSuccess(state.context, { userId: target.id, username: target.username, role }, { headers: state.rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaborators] role failed:', error?.message || error);
    return apiError(state.context, 'internal_error', 'The collaborator role could not be changed.', 500, { headers: state.rateHeaders });
  }
}

export async function DELETE(request, { params }) {
  const state = await contextFor(request, params, ['lixblogs:collaboration:write'], 'collaborators.remove');
  if (state.response) return state.response;
  try {
    const body = await request.json().catch(() => ({}));
    const target = body?.user ? await resolveCollaboratorUser(state.db, body.user) : { id: state.auth.userId, username: null };
    if (!target) return apiError(state.context, 'user_not_found', 'The requested user was not found.', 404, { headers: state.rateHeaders });
    if (target.id !== state.auth.userId && !state.access.canManage) {
      return apiError(state.context, 'role_forbidden', 'You cannot remove collaborators from this blog.', 403, { headers: state.rateHeaders });
    }
    const result = await state.db.prepare('DELETE FROM blog_co_authors WHERE blog_id = ? AND user_id = ?').bind(state.id, target.id).run();
    if (!result?.meta?.changes) return apiError(state.context, 'collaborator_not_found', 'The collaborator or invitation was not found.', 404, { headers: state.rateHeaders });
    await audit(state, 'collaborators.remove', target.id);
    return apiSuccess(state.context, { removed: true, userId: target.id }, { headers: state.rateHeaders });
  } catch (error) {
    console.error('[api/v1/collaborators] remove failed:', error?.message || error);
    return apiError(state.context, 'internal_error', 'The collaborator could not be removed.', 500, { headers: state.rateHeaders });
  }
}
