export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

async function getTarget(db, username) {
  return db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username = ?')
    .bind(username).first();
}

// GET — does the current user follow @username? { following, self }
export async function GET(request, { params }) {
  const { username } = await params;
  const session = await getSession().catch(() => null);
  if (!session?.userId) return NextResponse.json({ following: false, self: false });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const target = await getTarget(db, username);
    if (!target) return NextResponse.json({ following: false, self: false });
    if (target.id === session.userId) return NextResponse.json({ following: false, self: true });
    const row = await db.prepare(
      "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? AND following_type = 'user'"
    ).bind(session.userId, target.id).first();
    return NextResponse.json({ following: !!row, self: false });
  } catch {
    return NextResponse.json({ following: false, self: false });
  }
}

// POST — follow @username
export async function POST(request, { params }) {
  const { username } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const target = await getTarget(db, username);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.id === session.userId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });

    const ins = await db.prepare(
      "INSERT OR IGNORE INTO follows (follower_id, following_id, following_type) VALUES (?, ?, 'user')"
    ).bind(session.userId, target.id).run();

    // Notify ONLY when this created a new follow row — repeated POSTs (already
    // following) must not stack duplicate "started following you" notifications.
    // D1 reports an ignored insert as zero changes. Treat an absent changes
    // count as unknown/unchanged instead of creating a notification on every
    // retry (some local adapters omit `meta`).
    const isNewFollow = (ins?.meta?.changes ?? 0) > 0;
    if (isNewFollow) try {
      await db.prepare("INSERT INTO creator_follow_events (id, target_type, target_id, follower_id, delta) VALUES (?, 'user', ?, ?, 1)")
        .bind(crypto.randomUUID(), target.id, session.userId).run();
    } catch {}
    if (isNewFollow) try {
      const { notify } = await import('../../../../../lib/notify');
      const actor = session.profile || {};
      await notify(db, {
        userId: target.id,
        type: 'follow',
        actorId: session.userId,
        actorName: actor.display_name || actor.username || 'Someone',
        actorAvatar: actor.avatar_url || '',
        // A follow relationship has one meaningful notification. This also
        // protects the recipient when a browser retries the POST.
        targetId: session.userId,
        targetUrl: `/${actor.username || ''}`,
        dedupe: true,
      });
    } catch {}

    return NextResponse.json({ following: true });
  } catch {
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}

// DELETE — unfollow @username
export async function DELETE(request, { params }) {
  const { username } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const target = await getTarget(db, username);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const removed = await db.prepare(
      "DELETE FROM follows WHERE follower_id = ? AND following_id = ? AND following_type = 'user'"
    ).bind(session.userId, target.id).run();
    if ((removed?.meta?.changes || 0) > 0) try {
      await db.prepare("INSERT INTO creator_follow_events (id, target_type, target_id, follower_id, delta) VALUES (?, 'user', ?, ?, -1)")
        .bind(crypto.randomUUID(), target.id, session.userId).run();
    } catch {}
    return NextResponse.json({ following: false });
  } catch {
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
  }
}
