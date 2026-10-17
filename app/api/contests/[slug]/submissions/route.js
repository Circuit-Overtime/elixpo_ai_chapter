export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import {
  CONTEST_SUBMISSION_SELECT,
  checkContestEligibility,
  canJudgeContest,
  contestRole,
  contestState,
  getContest,
  parseJson,
  recordContestAudit,
  serializeSubmission,
  submissionSnapshot,
} from '../../../../../lib/contests';
import { notify } from '../../../../../lib/notify';

export async function GET(request, { params }) {
  const { slug } = await params;
  const session = await getSession().catch(() => null);
  const includeSnapshot = new URL(request.url).searchParams.get('snapshot') === 'true';
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest || contest.status === 'draft') return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const role = await contestRole(db, contest, session?.userId);
    if (includeSnapshot && !canJudgeContest(role)) return NextResponse.json({ error: 'Judge access is required' }, { status: 403 });
    const rows = await db.prepare(`${CONTEST_SUBMISSION_SELECT}
      WHERE s.contest_id = ? AND s.withdrawn_at IS NULL
      ORDER BY CASE a.placement WHEN 'winner' THEN 0 WHEN 'runner-up' THEN 1 WHEN 'honorable-mention' THEN 2 ELSE 3 END,
        a.position ASC, s.submitted_at DESC
    `).bind(contest.id).all();
    return NextResponse.json({ submissions: (rows?.results || []).map((row) => serializeSubmission(row, { includeSnapshot })) });
  } catch (error) {
    console.error('[contest submissions] list failed:', error?.message || error);
    return NextResponse.json({ error: 'Submissions could not be loaded' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!input.blogId) return NextResponse.json({ error: 'blogId is required' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest || contestState(contest) !== 'live') return NextResponse.json({ error: 'This contest is not accepting submissions' }, { status: 409 });
    const eligibilityError = await checkContestEligibility(db, contest, session.userId);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 403 });
    const blog = await db.prepare(`SELECT * FROM blogs WHERE (id = ? OR slugid = ?) AND author_id = ?
      AND status = 'published' AND secret = 0 AND deleted_at IS NULL LIMIT 1`).bind(input.blogId, input.blogId, session.userId).first();
    if (!blog) return NextResponse.json({ error: 'An owned public published blog was not found' }, { status: 404 });
    const targets = parseJson(contest.allowed_targets, ['personal']);
    if (targets.length && !targets.includes(blog.published_as || 'personal')) return NextResponse.json({ error: 'This publication target is not eligible for the contest' }, { status: 400 });
    const tagRows = await db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ?').bind(blog.id).all();
    const tags = (tagRows?.results || []).map((row) => row.tag);
    const required = parseJson(contest.required_topics, []);
    const lowerTags = new Set(tags.map((tag) => tag.toLowerCase()));
    const missing = required.filter((topic) => !lowerTags.has(topic.toLowerCase()));
    if (missing.length) return NextResponse.json({ error: `Missing required topics: ${missing.join(', ')}` }, { status: 400 });
    const count = await db.prepare(`SELECT COUNT(*) AS count FROM contest_submissions
      WHERE contest_id = ? AND author_id = ? AND withdrawn_at IS NULL`).bind(contest.id, session.userId).first();
    if (Number(count?.count || 0) >= Number(contest.per_author_limit || 1)) return NextResponse.json({ error: 'Submission limit reached' }, { status: 409 });
    const snapshot = submissionSnapshot(blog, tags);
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO contest_submissions
      (id, contest_id, blog_id, author_id, snapshot_content, snapshot_metadata, blog_updated_at, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`).bind(
      id, contest.id, blog.id, session.userId, snapshot.content, snapshot.metadata, blog.updated_at,
    ).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'submission.created', targetId: id, metadata: { blogId: blog.id, blogUpdatedAt: blog.updated_at } });
    if (contest.organizer_id !== session.userId) await notify(db, {
      userId: contest.organizer_id, type: 'contest_submission', actorId: session.userId,
      targetId: contest.id, targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`,
    });
    return NextResponse.json({ ok: true, id, frozenAt: blog.updated_at }, { status: 201 });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return NextResponse.json({ error: 'This blog is already submitted' }, { status: 409 });
    console.error('[contest submissions] create failed:', error?.message || error);
    return NextResponse.json({ error: 'Submission could not be created' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const submissionId = new URL(request.url).searchParams.get('submissionId');
  if (!submissionId) return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest || contestState(contest) !== 'live') return NextResponse.json({ error: 'The withdrawal deadline has passed' }, { status: 409 });
    const result = await db.prepare(`UPDATE contest_submissions SET withdrawn_at = unixepoch()
      WHERE id = ? AND contest_id = ? AND author_id = ? AND withdrawn_at IS NULL`).bind(submissionId, contest.id, session.userId).run();
    if (!result?.meta?.changes) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'submission.withdrawn', targetId: submissionId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Submission could not be withdrawn' }, { status: 500 });
  }
}
