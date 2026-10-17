export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { CREATOR_BADGE_MAP, CREATOR_BADGES, evaluateCreatorBadges, listUserBadges } from '../../../lib/creatorBadges';

export async function GET(request) {
  const session = await getSession();
  const username = new URL(request.url).searchParams.get('username')?.trim().toLowerCase();

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const target = username
      ? await db.prepare('SELECT id, username FROM users WHERE LOWER(username) = ?').bind(username).first()
      : session?.userId
        ? await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(session.userId).first()
        : null;
    if (!target) return NextResponse.json({ error: username ? 'User not found' : 'Not authenticated' }, { status: username ? 404 : 401 });

    const isOwner = session?.userId === target.id;
    let progress = [];
    let newlyEarned = [];
    if (isOwner) {
      const evaluation = await evaluateCreatorBadges(db, target.id);
      progress = evaluation.progress;
      newlyEarned = evaluation.newlyEarned;
    }
    const badges = await listUserBadges(db, target.id, { includeHidden: isOwner });
    return NextResponse.json({ badges, progress: isOwner ? progress : undefined, newlyEarned, isOwner });
  } catch (error) {
    console.error('Badge list error:', error);
    return NextResponse.json({ error: 'Failed to load badges' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const badgeId = String(body.badgeId || '');
  if (!CREATOR_BADGE_MAP.has(badgeId)) return NextResponse.json({ error: 'Unknown badge' }, { status: 400 });
  const visible = body.visible === true;
  const requestedPin = body.pinnedPosition == null ? null : Number(body.pinnedPosition);
  if (requestedPin !== null && ![1, 2, 3].includes(requestedPin)) {
    return NextResponse.json({ error: 'Pinned position must be 1, 2, 3, or null' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const owned = await db.prepare('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?').bind(session.userId, badgeId).first();
    if (!owned) return NextResponse.json({ error: 'Badge has not been earned' }, { status: 404 });
    const pin = visible ? requestedPin : null;
    const now = Math.floor(Date.now() / 1000);
    const statements = [];
    if (pin !== null) {
      statements.push(db.prepare('UPDATE user_badges SET pinned_position = NULL, updated_at = ? WHERE user_id = ? AND pinned_position = ?').bind(now, session.userId, pin));
    }
    statements.push(db.prepare('UPDATE user_badges SET visible = ?, pinned_position = ?, updated_at = ? WHERE user_id = ? AND badge_id = ?').bind(visible ? 1 : 0, pin, now, session.userId, badgeId));
    statements.push(db.prepare(`
      INSERT INTO badge_award_events (id, user_id, badge_id, event_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), session.userId, badgeId, visible ? (pin ? 'pinned' : 'shown') : 'hidden', JSON.stringify({ pinnedPosition: pin }), now));
    await db.batch(statements);
    return NextResponse.json({ ok: true, badges: await listUserBadges(db, session.userId, { includeHidden: true }) });
  } catch (error) {
    console.error('Badge update error:', error);
    return NextResponse.json({ error: 'Failed to update badge' }, { status: 500 });
  }
}

export async function POST() {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const evaluation = await evaluateCreatorBadges(db, session.userId);
    return NextResponse.json({ ok: true, newlyEarned: evaluation.newlyEarned });
  } catch (error) {
    console.error('Badge evaluation error:', error);
    return NextResponse.json({ error: 'Failed to evaluate badges' }, { status: 500 });
  }
}

// PATCH — staff-only manual award/revoke, currently used for Staff Pick.
export async function PATCH(request) {
  const session = await getSession();
  if (!session?.userId || !session.profile?.isAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const action = body.action === 'revoke' ? 'revoke' : 'award';
  if (!username || body.badgeId !== 'staff-pick') {
    return NextResponse.json({ error: 'A username and the staff-pick badge are required' }, { status: 400 });
  }
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const target = await db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const now = Math.floor(Date.now() / 1000);
    if (action === 'revoke') {
      await db.batch([
        db.prepare("DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'staff-pick'").bind(target.id),
        db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ? AND type = 'badge_awarded'").bind(`badge-awarded:${target.id}:staff-pick`, target.id),
        db.prepare("INSERT INTO badge_award_events (id, user_id, badge_id, event_type, metadata, created_at) VALUES (?, ?, 'staff-pick', 'revoked', ?, ?)").bind(crypto.randomUUID(), target.id, JSON.stringify({ by: session.userId }), now),
      ]);
    } else {
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id, awarded_at, visible, source, progress_value, progress_target, updated_at) VALUES (?, 'staff-pick', ?, 0, 'manual', 1, 1, ?)").bind(target.id, now, now),
        db.prepare("INSERT OR IGNORE INTO badge_award_events (id, user_id, badge_id, event_type, metadata, created_at) VALUES (?, ?, 'staff-pick', 'awarded', ?, ?)").bind(crypto.randomUUID(), target.id, JSON.stringify({ by: session.userId }), now),
        db.prepare("INSERT OR IGNORE INTO notifications (id, user_id, type, actor_name, target_id, target_title, target_url, created_at) VALUES (?, ?, 'badge_awarded', 'LixBlogs', 'staff-pick', 'Staff Pick', '/profile#creator-badges', ?)").bind(`badge-awarded:${target.id}:staff-pick`, target.id, now),
      ]);
    }
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error('Manual badge update error:', error);
    return NextResponse.json({ error: 'Failed to update badge award' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({ badges: CREATOR_BADGES });
}
