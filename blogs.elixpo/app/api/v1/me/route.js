export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';
import { recordApiAudit } from '../../../../lib/api/v1/operations';
import { normalizeDesignation } from '../../../../lib/profile';

function serializeProfile(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    designation: user.designation || null,
    email: user.email || null,
    avatarUrl: user.avatar_url || null,
  };
}

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:profile:read'], 'profile.get');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const user = await db.prepare(`
      SELECT id, username, display_name, designation, email, avatar_url
      FROM users WHERE id = ?
    `).bind(auth.userId).first();
    if (!user) {
      return apiError(context, 'account_not_provisioned', 'This profile is not available in LixBlogs.', 404, { headers: rateHeaders });
    }
    await recordApiAudit(db, {
      requestId: context.requestId,
      userId: auth.userId,
      clientId: auth.clientId,
      action: 'profile.get',
      resourceType: 'user',
      resourceId: auth.userId,
    });
    return apiSuccess(context, serializeProfile(user), { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/me] read failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The profile could not be loaded.', 500, { headers: rateHeaders });
  }
}

export async function PATCH(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:profile:write'], 'profile.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders });
  }
  if (!Object.prototype.hasOwnProperty.call(body || {}, 'designation')) {
    return apiError(context, 'invalid_profile', 'Provide designation to update the profile.', 400, { headers: rateHeaders });
  }

  let designation;
  try {
    designation = normalizeDesignation(body.designation);
  } catch (error) {
    return apiError(context, 'invalid_designation', error.message, 400, { headers: rateHeaders });
  }
  const { findProfanity } = await import('../../../../lib/validate');
  if (findProfanity(designation)) {
    return apiError(context, 'invalid_designation', 'Designation contains language that is not allowed.', 400, { headers: rateHeaders });
  }

  try {
    await db.prepare('UPDATE users SET designation = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(designation, auth.userId).run();
    const user = await db.prepare(`
      SELECT id, username, display_name, designation, email, avatar_url
      FROM users WHERE id = ?
    `).bind(auth.userId).first();
    try {
      const { kvInvalidate } = await import('../../../../lib/cache');
      await kvInvalidate(`v1:user:${auth.userId}`);
    } catch {}
    await recordApiAudit(db, {
      requestId: context.requestId,
      userId: auth.userId,
      clientId: auth.clientId,
      action: 'profile.update',
      resourceType: 'user',
      resourceId: auth.userId,
    });
    return apiSuccess(context, serializeProfile(user), { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/me] update failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The profile could not be updated.', 500, { headers: rateHeaders });
  }
}
