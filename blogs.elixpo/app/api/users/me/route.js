export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// Update current user's profile
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Profile update must be a JSON object' }, { status: 400 });
  }
  const {
    display_name, bio, location, timezone, pronouns, website, company, links,
  } = body;
  let designation;
  try {
    const { normalizeDesignation } = await import('../../../../lib/profile');
    designation = normalizeDesignation(body.designation);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Content + website validation (https-only, no NSFW).
  const { findProfanity, normalizeHttpsUrl } = await import('../../../../lib/validate');
  if (findProfanity(display_name) || findProfanity(designation) || findProfanity(bio) || findProfanity(company) || findProfanity(location) || findProfanity(pronouns)) {
    return NextResponse.json({ error: 'Contains language that is not allowed' }, { status: 400 });
  }
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
      if (u == null) return NextResponse.json({ error: 'Links must be valid https:// URLs' }, { status: 400 });
      normLinks.push({ ...l, url: u });
    }
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE users SET
        display_name = COALESCE(?, display_name),
        designation = CASE WHEN ? THEN ? ELSE designation END,
        bio = COALESCE(?, bio),
        location = COALESCE(?, location),
        timezone = COALESCE(?, timezone),
        pronouns = COALESCE(?, pronouns),
        website = COALESCE(?, website),
        company = COALESCE(?, company),
        links = COALESCE(?, links),
        updated_at = ?
      WHERE id = ?
    `).bind(
      display_name || null, designation === undefined ? 0 : 1, designation ?? '',
      bio === undefined ? null : bio, location === undefined ? null : location,
      timezone === undefined ? null : timezone, pronouns === undefined ? null : pronouns,
      normWebsite ?? null, company === undefined ? null : company,
      normLinks ? JSON.stringify(normLinks) : null, now, session.userId,
    ).run();

    // Profile metadata and its sitemap last-modified value changed together.
    try {
      const { kvInvalidate, PUBLIC_SITEMAP_CACHE_KEY } = await import('../../../../lib/cache');
      await kvInvalidate(`v1:user:${session.userId}`, PUBLIC_SITEMAP_CACHE_KEY);
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Update user error:', e);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE — permanently delete account (mark as removed, wipe PII)
export async function DELETE() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    // Fetch email before wiping for the goodbye email
    const user = await db.prepare('SELECT email, display_name FROM users WHERE id = ?').bind(session.userId).first();

    // Mark as removed and wipe personal data
    await db.prepare(`
      UPDATE users SET
        account_status = 'removed',
        display_name = 'Deleted User',
        designation = '',
        bio = NULL,
        email = NULL,
        avatar_url = NULL,
        avatar_r2_key = NULL,
        banner_r2_key = NULL,
        location = '',
        timezone = '',
        pronouns = '',
        website = '',
        company = '',
        links = '[]',
        updated_at = ?
      WHERE id = ?
    `).bind(now, session.userId).run();

    // Unpublish all blogs
    await db.prepare(
      "UPDATE blogs SET status = 'archived', updated_at = ? WHERE author_id = ?"
    ).bind(now, session.userId).run();

    try {
      const { kvInvalidate, PUBLIC_SITEMAP_CACHE_KEY } = await import('../../../../lib/cache');
      await kvInvalidate(PUBLIC_SITEMAP_CACHE_KEY);
    } catch {}

    // Send deletion confirmation email
    if (user?.email) {
      try {
        const { sendAccountDeleted } = await import('../../../../lib/email');
        sendAccountDeleted(user.email, { displayName: user.display_name }).catch(() => {});
      } catch {}
    }

    // Clear session
    const { clearSession } = await import('../../../../lib/auth');
    await clearSession();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Delete account error:', e);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
