export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { getLimits } from '../../../lib/tiers';

// List user's orgs
export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    // Orgs the user owns or is a member of
    const owned = await db.prepare(`
      SELECT o.*, 'admin' as role,
        (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count
      FROM orgs o WHERE o.owner_id = ?
    `).bind(session.userId).all();

    const memberships = await db.prepare(`
      SELECT o.*, om.role,
        (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count
      FROM org_members om
      JOIN orgs o ON o.id = om.org_id
      WHERE om.user_id = ? AND o.owner_id != ?
    `).bind(session.userId, session.userId).all();

    const orgs = [...(owned?.results || []), ...(memberships?.results || [])];
    return NextResponse.json({ orgs });
  } catch {
    return NextResponse.json({ orgs: [] });
  }
}

// Create org
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, slug, tagline, description, bio, website, visibility } = await request.json();

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
  }

  // Content + website validation (https-only, no NSFW).
  const { findProfanity, normalizeHttpsUrl } = await import('../../../lib/validate');
  const cleanTagline = String(tagline || '').trim();
  if (cleanTagline.length > 100) return NextResponse.json({ error: 'Organization tagline must be 100 characters or fewer' }, { status: 400 });
  const badWord = findProfanity(name) || findProfanity(cleanTagline) || findProfanity(description) || findProfanity(bio) || findProfanity(slug);
  if (badWord) return NextResponse.json({ error: 'Contains language that is not allowed' }, { status: 400 });
  let normWebsite = website || '';
  if (website) {
    normWebsite = normalizeHttpsUrl(website);
    if (normWebsite == null) return NextResponse.json({ error: 'Website must be a valid https:// URL' }, { status: 400 });
  }

  // Validate slug format (alphanumeric + single hyphens, 6–48 chars).
  const { validateSlug } = await import('../../../lib/slugify');
  const slugCheck = validateSlug(slug, { label: 'Org handle' });
  if (!slugCheck.ok) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
  const cleanSlug = slugCheck.slug;

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    // Check tier limit
    const user = await db.prepare('SELECT tier FROM users WHERE id = ?').bind(session.userId).first();
    const limits = getLimits(user?.tier || 'free');
    const ownedCount = await db.prepare('SELECT COUNT(*) as c FROM orgs WHERE owner_id = ?').bind(session.userId).first();

    if ((ownedCount?.c || 0) >= limits.ownedOrgs) {
      return NextResponse.json({ error: `You can own up to ${limits.ownedOrgs} org(s) on the ${user?.tier || 'free'} plan` }, { status: 403 });
    }

    // Atomically reserve the slug — prevents race conditions
    const { tryReserveName } = await import('../../../lib/namespace');
    const orgId = crypto.randomUUID();
    const reserve = await tryReserveName(db, cleanSlug, 'org', orgId);
    if (!reserve.success) {
      return NextResponse.json({ error: reserve.error || 'This name is already taken' }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);

    await db.prepare(`
      INSERT INTO orgs (id, slug, name, tagline, description, bio, website, visibility, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(orgId, cleanSlug, name.trim(), cleanTagline, description || '', bio || '', normWebsite || '', visibility || 'public', session.userId, now, now).run();

    // Owner is also a member with admin role
    await db.prepare(`
      INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)
    `).bind(orgId, session.userId, now).run();

    return NextResponse.json({ ok: true, id: orgId, slug: cleanSlug });
  } catch (e) {
    console.error('Create org error:', e);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}

// Update org
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { orgId, slug, name, tagline, description, bio, website, links, visibility, featured_blog_ids, timezone, location, contact_email } = await request.json();
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  // Content + website validation (https-only, no NSFW).
  const { findProfanity, normalizeHttpsUrl } = await import('../../../lib/validate');
  const cleanTagline = tagline === undefined ? undefined : String(tagline || '').trim();
  if (cleanTagline !== undefined && cleanTagline.length > 100) return NextResponse.json({ error: 'Organization tagline must be 100 characters or fewer' }, { status: 400 });
  const badWord = findProfanity(name) || findProfanity(cleanTagline) || findProfanity(description) || findProfanity(bio) || findProfanity(location);
  if (badWord) return NextResponse.json({ error: 'Contains language that is not allowed' }, { status: 400 });
  let normWebsite = website;
  if (website != null && website !== '') {
    normWebsite = normalizeHttpsUrl(website);
    if (normWebsite == null) return NextResponse.json({ error: 'Website must be a valid https:// URL' }, { status: 400 });
  }
  let normLinks = links;
  if (Array.isArray(links)) {
    normLinks = [];
    for (const l of links) {
      if (!l?.url?.trim()) continue;
      const u = normalizeHttpsUrl(l.url);
      if (u == null) return NextResponse.json({ error: `Link "${l.label || l.type}" must be a valid https:// URL` }, { status: 400 });
      normLinks.push({ ...l, url: u });
    }
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    // Only owner or admin can update
    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    const isOwner = org.owner_id === session.userId;
    const membership = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, session.userId).first();
    const isAdmin = membership?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Handle a slug (handle) change — owner/admin only, validated + uniquely
    // reserved in the namespace, releasing the old one. Returned so the client
    // can update the URL bar.
    let finalSlug = null;
    if (typeof slug === 'string' && slug.trim()) {
      const { validateSlug } = await import('../../../lib/slugify');
      const cur = await db.prepare('SELECT slug FROM orgs WHERE id = ?').bind(orgId).first();
      const check = validateSlug(slug, { label: 'Org handle' });
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      if (cur && check.slug !== cur.slug) {
        const { reserveName, releaseName } = await import('../../../lib/namespace');
        const res = await reserveName(db, check.slug, 'org', orgId);
        if (!res.success) return NextResponse.json({ error: 'That handle is already taken' }, { status: 409 });
        await releaseName(db, cur.slug);
        await db.prepare('UPDATE orgs SET slug = ? WHERE id = ?').bind(check.slug, orgId).run();
        finalSlug = check.slug;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE orgs SET name = COALESCE(?, name), tagline = COALESCE(?, tagline), description = COALESCE(?, description),
        bio = COALESCE(?, bio), website = COALESCE(?, website),
        links = COALESCE(?, links), visibility = COALESCE(?, visibility),
        featured_blog_ids = COALESCE(?, featured_blog_ids),
        timezone = COALESCE(?, timezone), location = COALESCE(?, location),
        contact_email = COALESCE(?, contact_email), updated_at = ?
      WHERE id = ?
    `).bind(
      name || null, cleanTagline ?? null, description || null, bio || null, normWebsite ?? null,
      normLinks ? JSON.stringify(normLinks) : null, visibility || null,
      featured_blog_ids ? JSON.stringify(featured_blog_ids) : null,
      timezone || null, location || null, contact_email || null, now, orgId
    ).run();

    return NextResponse.json({ ok: true, slug: finalSlug });
  } catch (e) {
    console.error('Update org error:', e);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// Delete org
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { orgId } = await request.json();
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    const org = await db.prepare('SELECT owner_id, slug FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org || org.owner_id !== session.userId) {
      return NextResponse.json({ error: 'Only the owner can delete an organization' }, { status: 403 });
    }

    // Cascade: members, invites, collections, namespace
    const { releaseName } = await import('../../../lib/namespace');
    await db.prepare('DELETE FROM org_members WHERE org_id = ?').bind(orgId).run();
    await db.prepare('DELETE FROM org_invites WHERE org_id = ?').bind(orgId).run();
    await db.prepare('DELETE FROM collections WHERE org_id = ?').bind(orgId).run();
    await db.prepare('DELETE FROM orgs WHERE id = ?').bind(orgId).run();
    if (org.slug) await releaseName(db, org.slug);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Delete org error:', e);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
