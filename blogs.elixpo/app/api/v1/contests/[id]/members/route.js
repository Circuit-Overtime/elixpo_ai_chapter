export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { CONTEST_ROLES, contestRole, getContest, recordContestAudit } from '../../../../../../lib/contests';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'contests.members.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const contest = await getContest(db, id), role = await contestRole(db, contest, auth.userId);
    if (!contest || !role) return apiError(context, 'contest_not_found', 'The contest was not found.', 404, { headers: rateHeaders });
    const rows = await db.prepare(`SELECT cm.user_id, cm.role, cm.created_at, u.username, u.display_name
      FROM contest_members cm JOIN users u ON u.id = cm.user_id WHERE cm.contest_id = ? ORDER BY cm.role, cm.created_at`).bind(contest.id).all();
    return apiSuccess(context, rows?.results || [], { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'Contest members could not be listed.', 500, { headers: rateHeaders }); }
}

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.members.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  if (!CONTEST_ROLES.has(input.role)) return apiError(context, 'invalid_role', 'Role must be moderator or judge.', 400, { headers: rateHeaders });
  try {
    const contest = await getContest(db, id);
    if (!contest || await contestRole(db, contest, auth.userId) !== 'organizer') return apiError(context, 'organizer_required', 'Only the organizer can manage roles.', 403, { headers: rateHeaders });
    const user = await db.prepare('SELECT id, username, display_name FROM users WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1').bind(input.user, input.user).first();
    if (!user || user.id === contest.organizer_id) return apiError(context, 'user_not_found', 'An eligible user was not found.', 404, { headers: rateHeaders });
    const existing = await db.prepare('SELECT 1 FROM contest_members WHERE contest_id = ? AND user_id = ?').bind(contest.id, user.id).first();
    const count = await db.prepare('SELECT COUNT(*) AS count FROM contest_members WHERE contest_id = ?').bind(contest.id).first();
    if (!existing && Number(count?.count || 0) >= 20) return apiError(context, 'member_limit', 'A contest can have at most 20 moderators and judges.', 409, { headers: rateHeaders });
    await db.prepare(`INSERT INTO contest_members (contest_id, user_id, role, added_by, created_at) VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(contest_id, user_id) DO UPDATE SET role = excluded.role, added_by = excluded.added_by`).bind(contest.id, user.id, input.role, auth.userId).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'member.assigned', targetId: user.id, metadata: { role: input.role } });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.members.update', resourceType: 'contest', resourceId: contest.id });
    return apiSuccess(context, { userId: user.id, username: user.username, role: input.role }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest member could not be updated.', 500, { headers: rateHeaders }); }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.members.remove');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params, userId = new URL(request.url).searchParams.get('userId');
  try {
    const contest = await getContest(db, id);
    if (!contest || await contestRole(db, contest, auth.userId) !== 'organizer') return apiError(context, 'organizer_required', 'Only the organizer can manage roles.', 403, { headers: rateHeaders });
    const result = await db.prepare('DELETE FROM contest_members WHERE contest_id = ? AND user_id = ?').bind(contest.id, userId).run();
    if (!result?.meta?.changes) return apiError(context, 'member_not_found', 'The contest member was not found.', 404, { headers: rateHeaders });
    await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'member.removed', targetId: userId });
    return apiSuccess(context, { removed: true, userId }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest member could not be removed.', 500, { headers: rateHeaders }); }
}
