export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

async function getOrg(db, slug) {
  return db.prepare('SELECT id, slug, name, owner_id FROM orgs WHERE LOWER(slug) = LOWER(?)').bind(slug).first();
}

async function isOwnPublication(db, org, userId) {
  if (org.owner_id === userId) return true;
  return !!(await db.prepare('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?')
    .bind(org.id, userId).first());
}

// GET — does the current user follow this org? { following }
export async function GET(request, { params }) {
  const { slug } = await params;
  const session = await getSession().catch(() => null);
  if (!session?.userId) return NextResponse.json({ following: false });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const org = await getOrg(db, slug);
    if (!org) return NextResponse.json({ following: false });
    if (await isOwnPublication(db, org, session.userId)) return NextResponse.json({ following: false, self: true });
    const row = await db.prepare(
      "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? AND following_type = 'org'"
    ).bind(session.userId, org.id).first();
    return NextResponse.json({ following: !!row, self: false });
  } catch {
    return NextResponse.json({ following: false });
  }
}

// POST — follow this org
export async function POST(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const org = await getOrg(db, slug);
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });
    if (await isOwnPublication(db, org, session.userId)) {
      return NextResponse.json({ error: 'Cannot follow your own publication' }, { status: 400 });
    }
    const inserted = await db.prepare(
      "INSERT OR IGNORE INTO follows (follower_id, following_id, following_type) VALUES (?, ?, 'org')"
    ).bind(session.userId, org.id).run();
    if ((inserted?.meta?.changes ?? 1) > 0) try {
      await db.prepare("INSERT INTO creator_follow_events (id, target_type, target_id, follower_id, delta) VALUES (?, 'org', ?, ?, 1)")
        .bind(crypto.randomUUID(), org.id, session.userId).run();
    } catch {}
    return NextResponse.json({ following: true });
  } catch {
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}

// DELETE — unfollow this org
export async function DELETE(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const org = await getOrg(db, slug);
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });
    const removed = await db.prepare(
      "DELETE FROM follows WHERE follower_id = ? AND following_id = ? AND following_type = 'org'"
    ).bind(session.userId, org.id).run();
    if ((removed?.meta?.changes || 0) > 0) try {
      await db.prepare("INSERT INTO creator_follow_events (id, target_type, target_id, follower_id, delta) VALUES (?, 'org', ?, ?, -1)")
        .bind(crypto.randomUUID(), org.id, session.userId).run();
    } catch {}
    return NextResponse.json({ following: false });
  } catch {
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
  }
}
