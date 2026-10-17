export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// List org members
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const members = await db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, om.role, om.joined_at,
        CASE WHEN o.owner_id = u.id THEN 1 ELSE 0 END as is_owner
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      JOIN orgs o ON o.id = om.org_id
      WHERE om.org_id = ?
      ORDER BY is_owner DESC, om.joined_at
    `).bind(orgId).all();

    return NextResponse.json({ members: members?.results || [] });
  } catch {
    return NextResponse.json({ members: [] });
  }
}

// Add member directly (by userId)
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, userId, role } = await request.json();
  if (!orgId || !userId || !['admin', 'maintain', 'write', 'read'].includes(role)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Must be owner or admin
    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    const isOwner = org.owner_id === session.userId;
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, session.userId).first();
    if (!isOwner && myRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Check user exists
    const targetUser = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(userId).first();
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Add or update member
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(org_id, user_id) DO UPDATE SET role = ?
    `).bind(orgId, userId, role, now, role).run();

    return NextResponse.json({ ok: true, username: targetUser.username });
  } catch (e) {
    console.error('Add member error:', e);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}

// Update member role
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, userId, role } = await request.json();
  if (!orgId || !userId || !['admin', 'maintain', 'write', 'read'].includes(role)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Must be owner or admin
    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    const isOwner = org.owner_id === session.userId;
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, session.userId).first();

    if (!isOwner && myRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Can't change owner's role
    if (userId === org.owner_id) {
      return NextResponse.json({ error: "Cannot change owner's role" }, { status: 400 });
    }

    await db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?')
      .bind(role, orgId, userId).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// Remove member
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, userId } = await request.json();
  if (!orgId || !userId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    // Owner can't be removed
    if (userId === org.owner_id) {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 });
    }

    // Must be owner, admin, or removing yourself
    const isOwner = org.owner_id === session.userId;
    const isSelf = userId === session.userId;
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, session.userId).first();

    if (!isOwner && myRole?.role !== 'admin' && !isSelf) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await db.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, userId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 });
  }
}
