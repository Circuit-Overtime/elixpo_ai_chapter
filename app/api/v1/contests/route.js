export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';
import { CONTEST_STATUSES, contestCoverUrl, contestSlug, normalizeContestEligibility, normalizeStringArray, recordContestAudit, serializeContest } from '../../../../lib/contests';
import { contentDiscoveryMetadata, loadRecommendationContext, rankContests } from '../../../../lib/recommendations';

const epoch = (value) => typeof value === 'number' ? Math.floor(value) : Math.floor(Date.parse(String(value || '')) / 1000);

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'contests.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const mine = url.searchParams.get('mine') === 'true';
  if (status && !CONTEST_STATUSES.has(status)) return apiError(context, 'invalid_status', 'Unknown contest status.', 400, { headers: rateHeaders });
  try {
    const rows = await db.prepare(`SELECT c.*, u.username AS organizer_username, u.display_name AS organizer_name,
      u.avatar_url AS organizer_avatar,
      (SELECT COUNT(*) FROM contest_submissions s WHERE s.contest_id = c.id AND s.withdrawn_at IS NULL) AS submission_count
      FROM contests c JOIN users u ON u.id = c.organizer_id
      WHERE c.status != 'draft' OR c.organizer_id = ? OR EXISTS (
        SELECT 1 FROM contest_members cm WHERE cm.contest_id = c.id AND cm.user_id = ?)
      ORDER BY c.starts_at DESC LIMIT 100`).bind(auth.userId, auth.userId).all();
    let contests = (rows?.results || []).map(serializeContest);
    if (status) contests = contests.filter((contest) => contest.status === status);
    if (mine) contests = contests.filter((contest) => contest.organizer.id === auth.userId);
    if (!mine) contests = rankContests(contests, await loadRecommendationContext(db, auth.userId, request.headers));
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.list', resourceType: 'contest' });
    return apiSuccess(context, contests, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'Contests could not be listed.', 500, { headers: rateHeaders }); }
}

export async function POST(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.create');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  const title = String(input.title || '').trim();
  const slug = contestSlug(input.slug || title);
  const startsAt = epoch(input.startsAt), submissionsCloseAt = epoch(input.submissionsCloseAt), judgingClosesAt = epoch(input.judgingClosesAt);
  if (!title || slug.length < 3) return apiError(context, 'invalid_contest', 'A title and valid slug are required.', 400, { headers: rateHeaders });
  const resultsAt = input.resultsAt ? epoch(input.resultsAt) : null;
  if (!(startsAt > Math.floor(Date.now() / 1000) && startsAt < submissionsCloseAt && submissionsCloseAt <= judgingClosesAt && (resultsAt === null || (Number.isFinite(resultsAt) && resultsAt >= judgingClosesAt)))) return apiError(context, 'invalid_dates', 'Contest dates must be in the future and ordered.', 400, { headers: rateHeaders });
  const perAuthorLimit = Number(input.perAuthorLimit ?? 1);
  const minimumAccountAgeMonths = Number(input.eligibility?.minimumAccountAgeMonths ?? 0);
  if (!Number.isInteger(perAuthorLimit) || perAuthorLimit < 1 || perAuthorLimit > 5) return apiError(context, 'invalid_entry_limit', 'Entries per author must be a whole number from 1 to 5.', 400, { headers: rateHeaders });
  if (!Number.isInteger(minimumAccountAgeMonths) || minimumAccountAgeMonths < 0) return apiError(context, 'invalid_account_age', 'Minimum account age must be a whole number of months from 0.', 400, { headers: rateHeaders });
  let coverUrl;
  try { coverUrl = contestCoverUrl(input.coverUrl); } catch { return apiError(context, 'invalid_cover_url', 'coverUrl must use HTTPS.', 400, { headers: rateHeaders }); }
  try {
    const owned = await db.prepare('SELECT COUNT(*) AS count FROM contests WHERE organizer_id = ?').bind(auth.userId).first();
    if (Number(owned?.count || 0) >= 50) return apiError(context, 'contest_limit', 'An account can own at most 50 contests.', 409, { headers: rateHeaders });
    if (await db.prepare('SELECT 1 FROM contests WHERE LOWER(slug) = LOWER(?)').bind(slug).first()) return apiError(context, 'slug_conflict', 'That contest slug is already used.', 409, { headers: rateHeaders });
    const id = crypto.randomUUID();
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(auth.userId).first();
    const discovery = contentDiscoveryMetadata({ language: input.language, region: input.region, locale: profile?.locale, headers: request.headers });
    await db.prepare(`INSERT INTO contests
      (id, organizer_id, slug, title, description, problem_statement, rules, theme, cover_url,
       template_content, status, starts_at, submissions_close_at, judging_closes_at, results_at,
       required_topics, tags, allowed_targets, eligibility, per_author_limit, language, region, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`).bind(
      id, auth.userId, slug, title, String(input.description || '').slice(0, 1000), String(input.problemStatement || '').slice(0, 10000),
      String(input.rules || '').slice(0, 20000), String(input.theme || '').slice(0, 500), coverUrl, String(input.templateContent || '').slice(0, 50000),
      startsAt, submissionsCloseAt, judgingClosesAt, resultsAt,
      JSON.stringify(normalizeStringArray(input.requiredTopics)), JSON.stringify(normalizeStringArray(input.tags)), JSON.stringify(normalizeStringArray(input.allowedTargets || ['personal'])),
      JSON.stringify(normalizeContestEligibility({ ...input.eligibility, minimumAccountAgeMonths })), perAuthorLimit, discovery.language, discovery.region,
    ).run();
    await recordContestAudit(db, { contestId: id, actorId: auth.userId, action: 'contest.created' });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.create', resourceType: 'contest', resourceId: id });
    return apiSuccess(context, { id, slug, status: 'draft' }, { status: 201, headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The contest could not be created.', 500, { headers: rateHeaders }); }
}
