export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/cloudflare';
import { notifyMany } from '../../../../lib/notify';
import { recordContestAudit } from '../../../../lib/contests';

async function recipients(db, contestId, { includeAuthors = false } = {}) {
  const rows = await db.prepare(`
    SELECT organizer_id AS user_id FROM contests WHERE id = ?
    UNION SELECT user_id FROM contest_members WHERE contest_id = ?
    ${includeAuthors ? 'UNION SELECT author_id FROM contest_submissions WHERE contest_id = ? AND withdrawn_at IS NULL' : ''}
  `).bind(...(includeAuthors ? [contestId, contestId, contestId] : [contestId, contestId])).all();
  return [...new Set((rows?.results || []).map((row) => row.user_id))];
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDB(), now = Math.floor(Date.now() / 1000), day = 86400;
  const changed = { opened: 0, reminders: 0, judging: 0 };
  try {
    const scheduled = await db.prepare("SELECT * FROM contests WHERE status = 'scheduled' AND starts_at <= ?").bind(now).all();
    for (const contest of scheduled?.results || []) {
      await db.prepare("UPDATE contests SET status = 'live', updated_at = unixepoch() WHERE id = ? AND status = 'scheduled'").bind(contest.id).run();
      await recordContestAudit(db, { contestId: contest.id, actorId: contest.organizer_id, action: 'contest.opened', metadata: { automated: true } });
      await notifyMany(db, await recipients(db, contest.id), { type: 'contest_opened', targetId: contest.id, targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`, dedupe: true });
      changed.opened++;
    }

    const closing = await db.prepare(`SELECT c.* FROM contests c WHERE c.status = 'live'
      AND c.submissions_close_at > ? AND c.submissions_close_at <= ?
      AND NOT EXISTS (SELECT 1 FROM contest_audit_log a WHERE a.contest_id = c.id AND a.action = 'contest.deadline.reminded')`).bind(now, now + day).all();
    for (const contest of closing?.results || []) {
      await recordContestAudit(db, { contestId: contest.id, actorId: contest.organizer_id, action: 'contest.deadline.reminded', metadata: { automated: true } });
      await notifyMany(db, await recipients(db, contest.id, { includeAuthors: true }), { type: 'contest_deadline', targetId: contest.id, targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`, dedupe: true });
      changed.reminders++;
    }

    const ended = await db.prepare("SELECT * FROM contests WHERE status IN ('scheduled', 'live') AND submissions_close_at <= ?").bind(now).all();
    for (const contest of ended?.results || []) {
      await db.prepare("UPDATE contests SET status = 'judging', updated_at = unixepoch() WHERE id = ? AND status IN ('scheduled', 'live')").bind(contest.id).run();
      await recordContestAudit(db, { contestId: contest.id, actorId: contest.organizer_id, action: 'contest.judging.started', metadata: { automated: true } });
      await notifyMany(db, await recipients(db, contest.id, { includeAuthors: true }), { type: 'contest_judging', targetId: contest.id, targetTitle: contest.title, targetUrl: `/contests/${contest.slug}`, dedupe: true });
      changed.judging++;
    }
    return NextResponse.json({ ok: true, ...changed });
  } catch (error) {
    console.error('[contest cron] failed:', error?.message || error);
    return NextResponse.json({ error: 'Contest transitions failed' }, { status: 500 });
  }
}
