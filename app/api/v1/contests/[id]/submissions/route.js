export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import {
  CONTEST_SUBMISSION_SELECT, canJudgeContest, checkContestEligibility, contestRole, contestState, getContest,
  parseJson, recordContestAudit, serializeSubmission, submissionSnapshot,
} from '../../../../../../lib/contests';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'contests.submissions.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const includeSnapshot = new URL(request.url).searchParams.get('snapshot') === 'true';
  try {
    const contest = await getContest(db, id);
    const role = await contestRole(db, contest, auth.userId);
    if (!contest || contest.status === 'draft') return apiError(context, 'contest_not_found', 'The contest was not found.', 404, { headers: rateHeaders });
    if (includeSnapshot && !canJudgeContest(role)) return apiError(context, 'judge_required', 'Judge access is required for snapshots.', 403, { headers: rateHeaders });
    const rows = await db.prepare(`${CONTEST_SUBMISSION_SELECT} WHERE s.contest_id = ? AND s.withdrawn_at IS NULL ORDER BY s.submitted_at DESC`).bind(contest.id).all();
    return apiSuccess(context, (rows?.results || []).map((row) => serializeSubmission(row, { includeSnapshot })), { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'Submissions could not be listed.', 500, { headers: rateHeaders }); }
}

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.submissions.create');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  try {
    const contest = await getContest(db, id);
    if (!contest || contestState(contest) !== 'live') return apiError(context, 'submissions_closed', 'This contest is not accepting submissions.', 409, { headers: rateHeaders });
    const eligibilityError = await checkContestEligibility(db, contest, auth.userId);
    if (eligibilityError) return apiError(context, 'author_ineligible', eligibilityError, 403, { headers: rateHeaders });
    const blog = await db.prepare(`SELECT * FROM blogs WHERE (id = ? OR slugid = ?) AND author_id = ? AND status = 'published' AND secret = 0 AND deleted_at IS NULL LIMIT 1`).bind(input.blogId, input.blogId, auth.userId).first();
    if (!blog) return apiError(context, 'blog_not_found', 'An owned public published blog was not found.', 404, { headers: rateHeaders });
    const targets = parseJson(contest.allowed_targets, ['personal']);
    if (targets.length && !targets.includes(blog.published_as || 'personal')) return apiError(context, 'target_ineligible', 'The blog publication target is not eligible.', 400, { headers: rateHeaders });
    const tagRows = await db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ?').bind(blog.id).all();
    const tags = (tagRows?.results || []).map((row) => row.tag);
    const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
    const missing = parseJson(contest.required_topics, []).filter((tag) => !tagSet.has(tag.toLowerCase()));
    if (missing.length) return apiError(context, 'topics_missing', `Missing required topics: ${missing.join(', ')}`, 400, { headers: rateHeaders });
    const count = await db.prepare('SELECT COUNT(*) AS count FROM contest_submissions WHERE contest_id = ? AND author_id = ? AND withdrawn_at IS NULL').bind(contest.id, auth.userId).first();
    if (Number(count?.count || 0) >= Number(contest.per_author_limit || 1)) return apiError(context, 'submission_limit', 'Submission limit reached.', 409, { headers: rateHeaders });
    const snapshot = submissionSnapshot(blog, tags), submissionId = crypto.randomUUID();
    await db.prepare(`INSERT INTO contest_submissions (id, contest_id, blog_id, author_id, snapshot_content, snapshot_metadata, blog_updated_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`)
      .bind(submissionId, contest.id, blog.id, auth.userId, snapshot.content, snapshot.metadata, blog.updated_at).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'submission.created', targetId: submissionId, metadata: { blogId: blog.id } });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'contests.submissions.create', resourceType: 'contest_submission', resourceId: submissionId });
    return apiSuccess(context, { id: submissionId, contestId: contest.id, blogId: blog.id, frozenAt: blog.updated_at }, { status: 201, headers: rateHeaders });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return apiError(context, 'already_submitted', 'This blog is already submitted.', 409, { headers: rateHeaders });
    return apiError(context, 'internal_error', 'The submission could not be created.', 500, { headers: rateHeaders });
  }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'contests.submissions.withdraw');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const submissionId = new URL(request.url).searchParams.get('submissionId');
  try {
    const contest = await getContest(db, id);
    if (!contest || contestState(contest) !== 'live') return apiError(context, 'withdrawal_closed', 'The withdrawal deadline has passed.', 409, { headers: rateHeaders });
    const result = await db.prepare('UPDATE contest_submissions SET withdrawn_at = unixepoch() WHERE id = ? AND contest_id = ? AND author_id = ? AND withdrawn_at IS NULL').bind(submissionId, contest.id, auth.userId).run();
    if (!result?.meta?.changes) return apiError(context, 'submission_not_found', 'The submission was not found.', 404, { headers: rateHeaders });
    await recordContestAudit(db, { contestId: contest.id, actorId: auth.userId, action: 'submission.withdrawn', targetId: submissionId });
    return apiSuccess(context, { withdrawn: true, id: submissionId }, { headers: rateHeaders });
  } catch { return apiError(context, 'internal_error', 'The submission could not be withdrawn.', 500, { headers: rateHeaders }); }
}
