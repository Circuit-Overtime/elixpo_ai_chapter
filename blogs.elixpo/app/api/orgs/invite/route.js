export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// Create invite link
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, role, maxUses, expiresInHours } = await request.json();
  if (!orgId || !['admin', 'maintain', 'write', 'read'].includes(role)) {
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
    if (!isOwner && myRole?.role !== 'admin' && myRole?.role !== 'maintain') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const inviteId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = expiresInHours ? now + (expiresInHours * 3600) : null;

    await db.prepare(`
      INSERT INTO org_invites (id, org_id, role, created_by, max_uses, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(inviteId, orgId, role, session.userId, maxUses || null, expiresAt, now).run();

    return NextResponse.json({ ok: true, inviteId, url: `/org/join/${inviteId}` });
  } catch (e) {
    console.error('Create invite error:', e);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}

// Accept invite (join org)
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { inviteId } = await request.json();
  if (!inviteId) return NextResponse.json({ error: 'Missing inviteId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const invite = await db.prepare('SELECT * FROM org_invites WHERE id = ?').bind(inviteId).first();
    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at && invite.expires_at < now) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
    }

    // Check max uses
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite has reached max uses' }, { status: 410 });
    }

    // Check if already a member
    const existing = await db.prepare('SELECT user_id FROM org_members WHERE org_id = ? AND user_id = ?')
      .bind(invite.org_id, session.userId).first();
    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 409 });
    }

    // Add as member
    await db.prepare('INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(invite.org_id, session.userId, invite.role, now).run();

    // Increment uses
    await db.prepare('UPDATE org_invites SET uses = uses + 1 WHERE id = ?').bind(inviteId).run();

    // Get org info for redirect
    const org = await db.prepare('SELECT slug, name FROM orgs WHERE id = ?').bind(invite.org_id).first();

    return NextResponse.json({ ok: true, orgSlug: org?.slug, orgName: org?.name });
  } catch (e) {
    console.error('Accept invite error:', e);
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 });
  }
}

// GET — single-invite preview (?inviteId, auth-optional for OG + join page) OR
// the org's invite list (?orgId, requires auth).
export async function GET(request) {
  const session = await getSession();
  const { searchParams } = new URL(request.url);
  const inviteId = searchParams.get('inviteId');

  // Invite preview: org identity + validity (+ membership when signed in).
  if (inviteId) {
    try {
      const { getDB } = await import('../../../../lib/cloudflare');
      const db = getDB();
      const invite = await db.prepare('SELECT * FROM org_invites WHERE id = ?').bind(inviteId).first();
      if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

      const now = Math.floor(Date.now() / 1000);
      const expired = !!(invite.expires_at && invite.expires_at < now);
      const maxed = !!(invite.max_uses && invite.uses >= invite.max_uses);
      const org = await db.prepare('SELECT slug, name, tagline, description, logo_url, logo_r2_key, owner_id FROM orgs WHERE id = ?')
        .bind(invite.org_id).first();
      const owner = org ? await db.prepare('SELECT display_name, username FROM users WHERE id = ?').bind(org.owner_id).first() : null;
      let alreadyMember = false;
      if (session?.userId) {
        const m = await db.prepare('SELECT user_id FROM org_members WHERE org_id = ? AND user_id = ?')
          .bind(invite.org_id, session.userId).first();
        alreadyMember = !!m;
      }
      return NextResponse.json({
        invite: { role: invite.role, expired, maxed, valid: !expired && !maxed },
        org: org ? { slug: org.slug, name: org.name, tagline: org.tagline || '', description: org.description, logo_url: org.logo_url || null } : null,
        owner: owner ? { display_name: owner.display_name, username: owner.username } : null,
        alreadyMember,
        authed: !!session?.userId,
      });
    } catch {
      return NextResponse.json({ error: 'Failed to load invite' }, { status: 500 });
    }
  }

  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const orgId = searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const invites = await db.prepare(`
      SELECT i.*, u.username as created_by_name
      FROM org_invites i
      JOIN users u ON u.id = i.created_by
      WHERE i.org_id = ?
      ORDER BY i.created_at DESC
    `).bind(orgId).all();

    return NextResponse.json({ invites: invites?.results || [] });
  } catch {
    return NextResponse.json({ invites: [] });
  }
}

// Delete invite
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { inviteId, orgId } = await request.json();
  if (!inviteId || !orgId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
    const isOwner = org?.owner_id === session.userId;
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, session.userId).first();

    if (!isOwner && myRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await db.prepare('DELETE FROM org_invites WHERE id = ? AND org_id = ?').bind(inviteId, orgId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
