export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import {
  CONTEST_PLACEMENTS,
  canJudgeContest,
  contestRole,
  contestState,
  getContest,
  recordContestAudit,
} from '../../../../../lib/contests';
import { notifyMany } from '../../../../../lib/notify';

export async function POST(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const awards = Array.isArray(input.awards) ? input.awards : [];
  if (!awards.length) return NextResponse.json({ error: 'At least one award is required' }, { status: 400 });
  if (awards.some((award) => !CONTEST_PLACEMENTS.has(award.placement) || !award.submissionId)) return NextResponse.json({ error: 'Every award requires a valid placement and submissionId' }, { status: 400 });
  if (awards.filter((award) => award.placement === 'winner').length !== 1) return NextResponse.json({ error: 'Results require exactly one winner' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    const role = await contestRole(db, contest, session.userId);
    if (!contest || !canJudgeContest(role)) return NextResponse.json({ error: 'Judge access is required' }, { status: 403 });
    if (!['judging', 'completed'].includes(contestState(contest))) return NextResponse.json({ error: 'Results can only be set during judging' }, { status: 409 });
    const uniqueSubmissions = new Set(awards.map((award) => award.submissionId));
    if (uniqueSubmissions.size !== awards.length) return NextResponse.json({ error: 'A submission can receive only one placement' }, { status: 400 });
    const found = await db.prepare(`SELECT id FROM contest_submissions WHERE contest_id = ? AND withdrawn_at IS NULL`).bind(contest.id).all();
    const eligible = new Set((found?.results || []).map((row) => row.id));
    if (awards.some((award) => !eligible.has(award.submissionId))) return NextResponse.json({ error: 'An award references an ineligible submission' }, { status: 400 });

    const statements = [db.prepare('DELETE FROM contest_awards WHERE contest_id = ?').bind(contest.id)];
    const placementCounts = new Map();
    for (const award of awards) {
      const position = (placementCounts.get(award.placement) || 0) + 1;
      placementCounts.set(award.placement, position);
      statements.push(db.prepare(`INSERT INTO contest_awards
        (contest_id, submission_id, placement, position, awarded_by, awarded_at)
        VALUES (?, ?, ?, ?, ?, unixepoch())`).bind(contest.id, award.submissionId, award.placement, position, session.userId));
    }
    if (input.finalize) statements.push(db.prepare("UPDATE contests SET status = 'completed', results_at = unixepoch(), updated_at = unixepoch() WHERE id = ?").bind(contest.id));
    await db.batch(statements);
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: input.finalize ? 'results.finalized' : 'results.updated', metadata: { awards: awards.length } });
    if (input.finalize) {
      const recipients = await db.prepare('SELECT DISTINCT author_id FROM contest_submissions WHERE contest_id = ? AND withdrawn_at IS NULL').bind(contest.id).all();
      await notifyMany(db, (recipients?.results || []).map((row) => row.author_id), {
        type: 'contest_results', actorId: session.userId, targetId: contest.id,
        targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`,
      });
    }
    return NextResponse.json({ ok: true, finalized: Boolean(input.finalize) });
  } catch (error) {
    console.error('[contest results] update failed:', error?.message || error);
    return NextResponse.json({ error: 'Contest results could not be updated' }, { status: 500 });
  }
}
