export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import { CONTEST_PLACEMENTS, canJudgeContest, contestRole, contestState, getContest, recordContestAudit } from '../../../../../../lib/contests';

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:publish'], 'contests.results.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  const awards = Array.isArray(input.awards) ? input.awards : [];
  try {
    const contest = await getContest(db, id), role = await contestRole(db, contest, auth.userId);
    if (!contest || !canJudgeContest(role)) return apiError(context, 'judge_required', 'Judge access is required.', 403, { headers: rateHeaders });
    if (contestState(contest) !== 'judging') return apiError(context, 'invalid_transition', 'Results can only be set during judging.', 409, { headers: rateHeaders });
    if (awards.filter((award) => award.placement === 'winner').length !== 1 || awards.some((award) => !CONTEST_PLACEMENTS.has(award.placement))) return apiError(context, 'invalid_awards', 'Results require exactly one winner and valid placements.', 400, { headers: rateHeaders });
    const eligibleRows = await db.prepare('SELECT id FROM contest_submissions WHERE contest_id = ? AND withdrawn_at IS NULL').bind(contest.id).all();
    const eligible = new Set((eligibleRows?.results || []).map((row) => row.id));
    if (new Set(awards.map((award) => award.submissionId)).size !== awards.length || awards.some((award) => !eligible.has(award.submissionId))) return apiError(context, 'invalid_awards', 'Awards must reference distinct eligible submissions.', 400, { headers: rateHeaders });
    const statements = [db.prepare('DELETE FROM contest_awards WHERE contest_id = ?').bind(contest.id)], counts = new Map();
    for (const award of awards) { const position = (counts.get(award.placement) || 0) + 1; counts.set(award.placement, position); statements.push(db.prepare('INSERT INTO contest_awards (contest_id, submission_id, placement, position, awarded_by, awarded_at) VALUES (?, ?, ?, ?, ?, unixepoch())').bind(contest.id, award.submissionId, award.placement, position, auth.userId)); }
    if (input.finalize) statements.push(db.prepare("UPDATE contests SET status = 'completed', results_at = unixepoch(), updated_at = unixepoch() WHERE id = ?").bind(contest.id));
    await db.batch(statements);
    await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: input.finalize ? 'results.finalized' : 'results.updated' });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.results.update', resourceType: 'contest', resourceId: contest.id });
    return apiSuccess(context, { updated: true, finalized: Boolean(input.finalize) }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'Contest results could not be updated.', 500, { headers: rateHeaders }); }
}
