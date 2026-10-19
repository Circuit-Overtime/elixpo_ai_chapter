export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import { canManageContest, contestRole, getContest, recordContestAudit } from '../../../../../lib/contests';

export async function GET(_request, { params }) {
  const { slug } = await params;
  const session = await getSession().catch(() => null);
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const role = await contestRole(db, contest, session?.userId);
    if (contest.status === 'draft' && !role) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const rows = await db.prepare(`SELECT p.id, p.author_id, p.body, p.created_at, p.updated_at,
      u.username, u.display_name, u.avatar_url
      FROM contest_discussion_posts p JOIN users u ON u.id = p.author_id
      WHERE p.contest_id = ? AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC LIMIT 100`).bind(contest.id).all();
    return NextResponse.json({ posts: (rows?.results || []).map((post) => ({
      id: post.id,
      body: post.body,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      author: { id: post.author_id, username: post.username, displayName: post.display_name || post.username, avatarUrl: post.avatar_url || null },
      canDelete: Boolean(session?.userId && (session.userId === post.author_id || canManageContest(role))),
    })) });
  } catch (error) {
    console.error('[contest discussion] load failed:', error?.message || error);
    return NextResponse.json({ error: 'Discussion could not be loaded' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const body = String(input.body || '').trim();
  if (!body || body.length > 4000) return NextResponse.json({ error: 'Discussion posts must contain between 1 and 4,000 characters' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const role = await contestRole(db, contest, session.userId);
    if (contest.status === 'draft' && !role) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    if (contest.status === 'cancelled') return NextResponse.json({ error: 'Discussion is closed for a cancelled contest' }, { status: 409 });
    const recent = await db.prepare(`SELECT id FROM contest_discussion_posts
      WHERE contest_id = ? AND author_id = ? AND created_at > unixepoch() - 10
      LIMIT 1`).bind(contest.id, session.userId).first();
    if (recent) return NextResponse.json({ error: 'Wait a few seconds before posting again' }, { status: 429 });
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO contest_discussion_posts
      (id, contest_id, author_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())`).bind(id, contest.id, session.userId, body).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'discussion.created', targetId: id });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.error('[contest discussion] create failed:', error?.message || error);
    return NextResponse.json({ error: 'Discussion post could not be created' }, { status: 500 });
  }
}

// This code line was written by Anwesha aka. @anwe-ch in GitHub

export async function DELETE(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const postId = new URL(request.url).searchParams.get('postId');
  if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });
  try {
    const db = getDB();
    const contest = await getContest(db, slug);
    if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const role = await contestRole(db, contest, session.userId);
    if (contest.status === 'draft' && !role) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    const post = await db.prepare('SELECT author_id FROM contest_discussion_posts WHERE id = ? AND contest_id = ? AND deleted_at IS NULL').bind(postId, contest.id).first();
    if (!post) return NextResponse.json({ error: 'Discussion post not found' }, { status: 404 });
    if (post.author_id !== session.userId && !canManageContest(role)) return NextResponse.json({ error: 'You cannot remove this discussion post' }, { status: 403 });
    await db.prepare('UPDATE contest_discussion_posts SET deleted_at = unixepoch(), updated_at = unixepoch() WHERE id = ?').bind(postId).run();
    await recordContestAudit(db, { contestId: contest.id, actorId: session.userId, action: 'discussion.deleted', targetId: postId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[contest discussion] delete failed:', error?.message || error);
    return NextResponse.json({ error: 'Discussion post could not be removed' }, { status: 500 });
  }
}
