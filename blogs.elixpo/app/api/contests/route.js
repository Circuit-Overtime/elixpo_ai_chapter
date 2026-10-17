export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { getDB } from '../../../lib/cloudflare';
import {
  contestCoverUrl,
  contestSlug,
  normalizeContestEligibility,
  normalizeStringArray,
  recordContestAudit,
  serializeContest,
} from '../../../lib/contests';
import { contentDiscoveryMetadata, loadRecommendationContext, rankContests } from '../../../lib/recommendations';

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export async function GET(request) {
  const session = await getSession().catch(() => null);
  const mine = new URL(request.url).searchParams.get('mine') === 'true';
  try {
    const db = getDB();
    const result = await db.prepare(`
      SELECT c.*, u.username AS organizer_username, u.display_name AS organizer_name,
        u.avatar_url AS organizer_avatar,
        (SELECT COUNT(*) FROM contest_submissions s
          WHERE s.contest_id = c.id AND s.withdrawn_at IS NULL) AS submission_count
      FROM contests c JOIN users u ON u.id = c.organizer_id
      WHERE c.status != 'draft'
        OR c.organizer_id = ?
        OR EXISTS (SELECT 1 FROM contest_members cm WHERE cm.contest_id = c.id AND cm.user_id = ?)
      ORDER BY
        CASE WHEN c.status IN ('scheduled', 'live') THEN 0 ELSE 1 END,
        c.starts_at DESC
      LIMIT 100
    `).bind(session?.userId || '', session?.userId || '').all();
    let contests = (result?.results || []).map((row) => serializeContest(row));
    if (mine) {
      if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      contests = contests.filter((contest) => contest.organizer.id === session.userId);
    }
    if (!mine) {
      const context = await loadRecommendationContext(db, session?.userId, request.headers);
      contests = rankContests(contests, context);
    }
    return NextResponse.json({ contests });
  } catch (error) {
    console.error('[contests] list failed:', error?.message || error);
    return NextResponse.json({ error: 'Contests could not be loaded' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const title = String(input.title || '').trim();
  const slug = contestSlug(input.slug || title);
  const startsAt = timestamp(input.startsAt);
  const submissionsCloseAt = timestamp(input.submissionsCloseAt);
  const judgingClosesAt = timestamp(input.judgingClosesAt);
  const resultsAt = input.resultsAt ? timestamp(input.resultsAt) : null;
  if (!title || title.length > 160 || slug.length < 3) return NextResponse.json({ error: 'A title and valid slug are required' }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  if (startsAt <= now || startsAt >= submissionsCloseAt || submissionsCloseAt > judgingClosesAt || (input.resultsAt && (!resultsAt || resultsAt < judgingClosesAt))) {
    return NextResponse.json({ error: 'Contest dates must be in the future and ordered: start, submission deadline, judging deadline' }, { status: 400 });
  }
  const perAuthorLimit = Number(input.perAuthorLimit ?? 1);
  const minimumAccountAgeMonths = Number(input.eligibility?.minimumAccountAgeMonths ?? 0);
  if (!Number.isInteger(perAuthorLimit) || perAuthorLimit < 1 || perAuthorLimit > 5) return NextResponse.json({ error: 'Entries per author must be a whole number from 1 to 5' }, { status: 400 });
  if (!Number.isInteger(minimumAccountAgeMonths) || minimumAccountAgeMonths < 0) return NextResponse.json({ error: 'Minimum account age must be a whole number of months from 0' }, { status: 400 });
  let coverUrl;
  try { coverUrl = contestCoverUrl(input.coverUrl); } catch { return NextResponse.json({ error: 'Cover URL must use HTTPS' }, { status: 400 }); }
  try {
    const db = getDB();
    const owned = await db.prepare('SELECT COUNT(*) AS count FROM contests WHERE organizer_id = ?').bind(session.userId).first();
    if (Number(owned?.count || 0) >= 50) return NextResponse.json({ error: 'An account can own at most 50 contests' }, { status: 409 });
    if (await db.prepare('SELECT 1 FROM contests WHERE LOWER(slug) = LOWER(?)').bind(slug).first()) {
      return NextResponse.json({ error: 'That contest slug is already used' }, { status: 409 });
    }
    const id = crypto.randomUUID();
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(session.userId).first();
    const discovery = contentDiscoveryMetadata({ language: input.language, region: input.region, locale: profile?.locale, headers: request.headers });
    await db.prepare(`
      INSERT INTO contests (
        id, organizer_id, slug, title, description, problem_statement, rules, theme,
        cover_url, template_content, status, starts_at, submissions_close_at,
        judging_closes_at, results_at, required_topics, tags, allowed_targets, eligibility,
        per_author_limit, language, region, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `).bind(
      id, session.userId, slug, title,
      String(input.description || '').trim().slice(0, 1000),
      String(input.problemStatement || '').trim().slice(0, 10000),
      String(input.rules || '').trim().slice(0, 20000),
      String(input.theme || '').trim().slice(0, 500), coverUrl,
      String(input.templateContent || '').slice(0, 50000),
      startsAt, submissionsCloseAt, judgingClosesAt, resultsAt,
      JSON.stringify(normalizeStringArray(input.requiredTopics)),
      JSON.stringify(normalizeStringArray(input.tags)),
      JSON.stringify(normalizeStringArray(input.allowedTargets || ['personal'])),
      JSON.stringify(normalizeContestEligibility({ ...input.eligibility, minimumAccountAgeMonths })),
      perAuthorLimit, discovery.language, discovery.region,
    ).run();
    await recordContestAudit(db, { contestId: id, actorId: session.userId, action: 'contest.created' });
    return NextResponse.json({ ok: true, id, slug, status: 'draft' }, { status: 201 });
  } catch (error) {
    console.error('[contests] create failed:', error?.message || error);
    return NextResponse.json({ error: 'Contest could not be created' }, { status: 500 });
  }
}
