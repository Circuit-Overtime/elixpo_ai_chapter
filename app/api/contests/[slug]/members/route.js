export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import { CONTEST_ROLES, contestRole, getContest, recordContestAudit } from '../../../../../lib/contests';
import { notify } from '../../../../../lib/notify';

export async function POST(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!CONTEST_ROLES.has(input.role)) return NextResponse.json({ error: 'Role must be moderator or judge' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest || await contestRole(db, contest, session.userId) !== 'organizer') return NextResponse.json({ error: 'Only the organizer can manage contest roles' }, { status: 403 });
    const count = await db.prepare('SELECT COUNT(*) AS count FROM contest_members WHERE contest_id = ?').bind(contest.id).first();
    const existing = await db.prepare('SELECT 1 FROM contest_members WHERE contest_id = ? AND user_id = (SELECT id FROM users WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1)').bind(contest.id, input.user, input.user).first();
    if (!existing && Number(count?.count || 0) >= 20) return NextResponse.json({ error: 'A contest can have at most 20 moderators and judges' }, { status: 409 });
    const user = await db.prepare('SELECT id, username, display_name FROM users WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1')
      .bind(input.user, input.user).first();
    if (!user || user.id === contest.organizer_id) return NextResponse.json({ error: 'An eligible user was not found' }, { status: 404 });
    await db.prepare(`INSERT INTO contest_members (contest_id, user_id, role, added_by, created_at)
      VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(contest_id, user_id) DO UPDATE SET role = excluded.role, added_by = excluded.added_by`)
      .bind(contest.id, user.id, input.role, session.userId).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'member.assigned', targetId: user.id, metadata: { role: input.role } });
    await notify(db, { userId: user.id, type: 'contest_role', actorId: session.userId, targetId: contest.id, targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`, dedupe: true });
    return NextResponse.json({ ok: true, member: { userId: user.id, username: user.username, role: input.role } });
  } catch {
    return NextResponse.json({ error: 'Contest member could not be updated' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const userId = new URL(request.url).searchParams.get('userId');
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest || await contestRole(db, contest, session.userId) !== 'organizer') return NextResponse.json({ error: 'Only the organizer can manage contest roles' }, { status: 403 });
    const result = await db.prepare('DELETE FROM contest_members WHERE contest_id = ? AND user_id = ?').bind(contest.id, userId).run();
    if (!result?.meta?.changes) return NextResponse.json({ error: 'Contest member not found' }, { status: 404 });
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'member.removed', targetId: userId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Contest member could not be removed' }, { status: 500 });
  }
}
