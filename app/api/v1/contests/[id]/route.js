export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import {
  canManageContest, contestCoverUrl, contestRole, contestSlug, getContest,
  normalizeContestEligibility, normalizeStringArray, parseJson, recordContestAudit, serializeContest,
} from '../../../../../lib/contests';

function epoch(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'contests.get');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const contest = await getContest(db, id);
    const role = await contestRole(db, contest, auth.userId);
    if (!contest || (contest.status === 'draft' && !role)) return apiError(context, 'contest_not_found', 'The contest was not found.', 404, { headers: rateHeaders });
    return apiSuccess(context, serializeContest(contest, { role }), { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest could not be loaded.', 500, { headers: rateHeaders }); }
}

export async function PATCH(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  try {
    const contest = await getContest(db, id);
    const role = await contestRole(db, contest, auth.userId);
    if (!contest || !canManageContest(role)) return apiError(context, 'contest_not_found', 'The contest was not found.', 404, { headers: rateHeaders });
    if (input.action === 'publish') {
      if (!contest.problem_statement || !contest.rules) return apiError(context, 'contest_incomplete', 'Problem statement and rules are required.', 400, { headers: rateHeaders });
      if (contest.status !== 'draft') return apiError(context, 'invalid_transition', 'Only a draft contest can be published.', 409, { headers: rateHeaders });
      await db.prepare("UPDATE contests SET status = 'scheduled', published_at = COALESCE(published_at, unixepoch()), updated_at = unixepoch() WHERE id = ? AND status = 'draft'").bind(contest.id).run();
      await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'contest.published' });
    } else if (input.action === 'cancel') {
      if (contest.status === 'completed') return apiError(context, 'invalid_transition', 'A completed contest cannot be cancelled.', 409, { headers: rateHeaders });
      await db.prepare("UPDATE contests SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?").bind(contest.id).run();
      await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'contest.cancelled' });
    } else {
      const columns = { title: ['title', 160], description: ['description', 1000], problemStatement: ['problem_statement', 10000], rules: ['rules', 20000], theme: ['theme', 500], templateContent: ['template_content', 50000] };
      const changes = [], values = [];
      let resultingSlug = contest.slug;
      if (input.slug !== undefined && contestSlug(input.slug) !== contest.slug) {
        if (role !== 'organizer' || contest.status !== 'draft') return apiError(context, 'slug_locked', 'Only the organizer can change the slug while the contest is a draft.', 403, { headers: rateHeaders });
        const nextSlug = contestSlug(input.slug);
        if (nextSlug.length < 3) return apiError(context, 'invalid_slug', 'Contest slug must contain at least three characters.', 400, { headers: rateHeaders });
        const conflict = await db.prepare('SELECT 1 FROM contests WHERE LOWER(slug) = LOWER(?) AND id != ?').bind(nextSlug, contest.id).first();
        if (conflict) return apiError(context, 'slug_conflict', 'That contest slug is already used.', 409, { headers: rateHeaders });
        changes.push('slug = ?'); values.push(nextSlug);
        resultingSlug = nextSlug;
      }
      for (const [key, [column, max]] of Object.entries(columns)) if (input[key] !== undefined) { changes.push(`${column} = ?`); values.push(String(input[key] || '').trim().slice(0, max)); }
      if (input.coverUrl !== undefined) {
        let coverUrl;
        try { coverUrl = contestCoverUrl(input.coverUrl); } catch { return apiError(context, 'invalid_cover_url', 'coverUrl must use HTTPS.', 400, { headers: rateHeaders }); }
        changes.push('cover_url = ?'); values.push(coverUrl);
      }
      if (input.requiredTopics !== undefined) { changes.push('required_topics = ?'); values.push(JSON.stringify(normalizeStringArray(input.requiredTopics))); }
      if (input.tags !== undefined) { changes.push('tags = ?'); values.push(JSON.stringify(normalizeStringArray(input.tags))); }
      if (input.allowedTargets !== undefined) { changes.push('allowed_targets = ?'); values.push(JSON.stringify(normalizeStringArray(input.allowedTargets))); }
      if (input.eligibility !== undefined) {
        const eligibility = input.eligibility && typeof input.eligibility === 'object' ? input.eligibility : {};
        const currentEligibility = parseJson(contest.eligibility, {});
        const currentMonths = currentEligibility.minimumAccountAgeMonths ?? Math.ceil(Number(currentEligibility.minimumAccountAgeDays || 0) / 30);
        const months = Number(eligibility.minimumAccountAgeMonths ?? currentMonths);
        if (!Number.isInteger(months) || months < 0) return apiError(context, 'invalid_account_age', 'Minimum account age must be a whole number of months from 0.', 400, { headers: rateHeaders });
        changes.push('eligibility = ?');
        values.push(JSON.stringify(normalizeContestEligibility({ ...eligibility, minimumAccountAgeMonths: months }, currentEligibility)));
      }
      if (input.perAuthorLimit !== undefined) {
        const limit = Number(input.perAuthorLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 5) return apiError(context, 'invalid_entry_limit', 'Entries per author must be a whole number from 1 to 5.', 400, { headers: rateHeaders });
        changes.push('per_author_limit = ?'); values.push(limit);
      }
      if (['startsAt', 'submissionsCloseAt', 'judgingClosesAt', 'resultsAt'].some((key) => input[key] !== undefined)) {
        const hasSubmissions = Boolean(await db.prepare('SELECT 1 FROM contest_submissions WHERE contest_id = ? LIMIT 1').bind(contest.id).first());
        if (hasSubmissions || Math.floor(Date.now() / 1000) >= Number(contest.starts_at)) return apiError(context, 'dates_locked', 'Contest dates are locked after opening or receiving a submission.', 409, { headers: rateHeaders });
        const startsAt = epoch(input.startsAt ?? contest.starts_at);
        const submissionsCloseAt = epoch(input.submissionsCloseAt ?? contest.submissions_close_at);
        const judgingClosesAt = epoch(input.judgingClosesAt ?? contest.judging_closes_at);
        const resultsAt = input.resultsAt === null ? null : epoch(input.resultsAt ?? contest.results_at) || null;
        if (!(startsAt > Math.floor(Date.now() / 1000) && startsAt < submissionsCloseAt && submissionsCloseAt <= judgingClosesAt && (resultsAt === null || (Number.isFinite(resultsAt) && resultsAt >= judgingClosesAt)))) return apiError(context, 'invalid_dates', 'Contest dates must be in the future and ordered.', 400, { headers: rateHeaders });
        changes.push('starts_at = ?', 'submissions_close_at = ?', 'judging_closes_at = ?', 'results_at = ?');
        values.push(startsAt, submissionsCloseAt, judgingClosesAt, resultsAt);
      }
      if (!changes.length) return apiError(context, 'no_changes', 'No supported changes were supplied.', 400, { headers: rateHeaders });
      await db.prepare(`UPDATE contests SET ${changes.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values, contest.id).run();
      await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'contest.updated' });
      contest.slug = resultingSlug;
    }
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.update', resourceType: 'contest', resourceId: contest.id });
    return apiSuccess(context, { id: contest.id, slug: contest.slug, updated: true }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest could not be updated.', 500, { headers: rateHeaders }); }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:delete'], 'contests.delete');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const contest = await getContest(db, id);
    if (!contest || contest.organizer_id !== auth.userId) return apiError(context, 'organizer_required', 'Only the organizer can delete this contest.', 403, { headers: rateHeaders });
    if (contest.status !== 'draft') return apiError(context, 'invalid_transition', 'Only a private draft contest can be deleted. Cancel published contests instead.', 409, { headers: rateHeaders });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.delete', resourceType: 'contest', resourceId: contest.id });
    await db.prepare('DELETE FROM contests WHERE id = ?').bind(contest.id).run();
    return apiSuccess(context, { deleted: true, id: contest.id }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest could not be deleted.', 500, { headers: rateHeaders }); }
}
