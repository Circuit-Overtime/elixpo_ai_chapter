export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { requestTooLarge, byteLength, MAX_BLOG_CONTENT_BYTES, MAX_TITLE_LEN, MAX_SUBTITLE_LEN } from '../../../../lib/limits';
import { readTimeFromWords } from '../../../../lib/readTime';
import { BLOG_LICENSES } from '../../../../lib/curatedCollections';
import { contentDiscoveryMetadata } from '../../../../lib/recommendations';

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (requestTooLarge(request)) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  const body = await request.json();
  const { slugid, title, subtitle, tags, publishAs, editorContent, pageEmoji, coverUrl, coverPos, coverZoom, status, lastKnownUpdatedAt, slug: requestedSlug, collectionId, secret, member_only, license: requestedLicense, language, region } = body;
  if (requestedLicense !== undefined && !BLOG_LICENSES.has(requestedLicense)) {
    return NextResponse.json({ error: 'Unsupported content license' }, { status: 400 });
  }
  const storedCover = validCoverUrl(coverUrl);
  const posX = Number.isFinite(coverPos?.x) ? coverPos.x : 50;
  const posY = Number.isFinite(coverPos?.y) ? coverPos.y : 50;
  const zoom = Number.isFinite(coverZoom) ? coverZoom : 1;

  // status: 'published' (feed), 'unlisted' (beta/public but no feed), 'draft'
  const targetStatus = status || 'published';
  if (!['published', 'unlisted', 'draft'].includes(targetStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  if (!slugid || !title?.trim()) {
    return NextResponse.json({ error: 'Missing slugid or title' }, { status: 400 });
  }

  if ((title?.length || 0) > MAX_TITLE_LEN || (subtitle?.length || 0) > MAX_SUBTITLE_LEN) {
    return NextResponse.json({ error: 'Title or subtitle too long' }, { status: 400 });
  }
  // Only gate the public-facing title/subtitle when actually publishing —
  // drafts can hold work-in-progress text.
  if (targetStatus !== 'draft') {
    const { findProfanity } = await import('../../../../lib/validate');
    if (findProfanity(title) || findProfanity(subtitle)) {
      return NextResponse.json({ error: 'Title or subtitle contains language that is not allowed' }, { status: 400 });
    }
  }
  if (byteLength(editorContent) > MAX_BLOG_CONTENT_BYTES) {
    return NextResponse.json({ error: 'Content too large' }, { status: 413 });
  }
  // Require real content before going public (drafts may be short/empty).
  if (targetStatus !== 'draft' && countWords(editorContent) < 20) {
    return NextResponse.json({ error: 'A post needs at least 20 words before publishing.' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { ensureUniqueBlogSlug } = await import('../../../../lib/namespace');
    const { compressBlogContent } = await import('../../../../lib/compress');
    const { checkPublishSafety } = await import('../../../../lib/blog-version');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const readTime = readTimeFromWords(countWords(editorContent));
    const compressedContent = editorContent ? compressBlogContent(editorContent) : '';
    const { excerptFromBlocks } = await import('../../../../lib/excerpt');
    const excerpt = editorContent ? excerptFromBlocks(editorContent) : '';
    const normalizedTags = Array.isArray(tags) ? normalizeTags(tags) : null;

    const existing = await db.prepare('SELECT id, author_id, status, published_as, slug, secret, member_only, license, language, region FROM blogs WHERE id = ?').bind(slugid).first();
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(existing?.author_id || session.userId).first();
    const discovery = contentDiscoveryMetadata({
      language: language ?? existing?.language,
      region: region ?? existing?.region,
      locale: profile?.locale,
      headers: request.headers,
    });
    let finalLicense = requestedLicense || existing?.license;
    if (!finalLicense) {
      const preference = await db.prepare('SELECT default_license FROM curation_preferences WHERE user_id = ?')
        .bind(existing?.author_id || session.userId).first();
      finalLicense = preference?.default_license || 'all-rights-reserved';
    }

    // Secret mode locks on first publish. While the post is still a draft the author
    // may toggle it freely; once it has been public even once the flag is frozen.
    // Un-secreting would retroactively expose an author whose byline crawlers, caches
    // and archives already captured — and secreting an already-public post would be a
    // promise we cannot keep. Enforced here, not in the UI, because the UI is only a hint.
    const requestedSecret = (secret === true || secret === 1) ? 1 : 0;
    const finalSecret = existing
      ? (existing.status === 'draft' ? requestedSecret : (existing.secret ? 1 : 0))
      : requestedSecret;

    const tierOwnerId = existing?.author_id || session.userId;
    const owner = await db.prepare('SELECT tier FROM users WHERE id = ?').bind(tierOwnerId).first();
    const { getLimits } = await import('../../../../lib/tiers');
    const limits = getLimits(owner?.tier);

    const requestedMemberOnly = (member_only === true || member_only === 1) ? 1 : 0;
    const grandfatheredMemberOnly = !!existing?.member_only;
    if (requestedMemberOnly && !limits.canMarkMemberOnly && !grandfatheredMemberOnly) {
      return NextResponse.json({ error: 'Free tier authors cannot mark posts as member-only' }, { status: 403 });
    }
    const finalMemberOnly = requestedMemberOnly && (limits.canMarkMemberOnly || grandfatheredMemberOnly) ? 1 : 0;

    // Is the requester the OWNER? (personal author, or org admin/owner.) Only the
    // owner may change a slug — collaborators (editors) cannot.
    let isOwner = false;
    if (existing) {
      isOwner = existing.author_id === session.userId;
      if (!isOwner && existing.published_as?.startsWith('org:')) {
        const orgId = existing.published_as.slice(4);
        const adminRow = await db
          .prepare("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role = 'admin'")
          .bind(orgId, session.userId).first();
        const ownerRow = adminRow || await db
          .prepare('SELECT 1 FROM orgs WHERE id = ? AND owner_id = ?')
          .bind(orgId, session.userId).first();
        isOwner = !!ownerRow;
      }
    }

    // A collection belongs to exactly one org, so it's only valid when the blog
    // is published under that org. Publishing personally — or naming a collection
    // from a different org — clears it. (Co-author access stays blog-scoped either
    // way; filing under a collection never grants org/collection-level rights.)
    let finalCollectionId = null;
    const effectivePublishAs = publishAs || existing?.published_as || 'personal';
    if (collectionId && effectivePublishAs.startsWith('org:')) {
      const orgId = effectivePublishAs.slice(4);
      const col = await db.prepare('SELECT id FROM collections WHERE id = ? AND org_id = ?')
        .bind(collectionId, orgId).first();
      if (col) finalCollectionId = collectionId;
    }

    // Slugs are unique per owner (the URL is /owner/slug), not globally.
    const slugScope = {
      authorId: session.userId,
      publishAs: existing?.published_as || publishAs || 'personal',
    };
    const wantsSlugChange = !!(requestedSlug && requestedSlug.trim());

    // Slug rules:
    //  - Existing blog: keep the slug unless the OWNER explicitly changes it.
    //    This applies to drafts too, so a collaborator cannot rename the URL.
    //  - First publish: honour a custom slug, else derive from the title.
    let slug;
    if (existing?.slug) {
      slug = (wantsSlugChange && isOwner)
        ? await ensureUniqueBlogSlug(db, generateSlug(requestedSlug), slugid, slugScope)
        : existing.slug;
    } else {
      const base = generateSlug(wantsSlugChange ? requestedSlug : title);
      slug = await ensureUniqueBlogSlug(db, base, slugid, slugScope);
    }

    if (existing) {
      // Permission: author, org write+, or accepted co-author.
      const { canEditBlog } = await import('../../../../lib/permissions');
      const perm = await canEditBlog(db, slugid, session.userId);
      if (!perm.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

      // Race condition check: ensure upstream hasn't changed since we loaded
      if (lastKnownUpdatedAt) {
        const safety = await checkPublishSafety(db, slugid, lastKnownUpdatedAt);
        if (!safety.safe) {
          return NextResponse.json({
            error: 'conflict',
            message: 'This blog was updated by someone else. Please sync before publishing.',
            currentVersion: safety.currentVersion,
          }, { status: 409 });
        }
      }

      const publishedAt = (targetStatus === 'published' || targetStatus === 'unlisted')
        ? (existing.status === 'draft' ? now : null)
        : null;

      let query = `
        UPDATE blogs SET title = ?, subtitle = ?, slug = ?, content = ?, excerpt = ?, published_as = ?,
          collection_id = ?, status = ?, page_emoji = ?, cover_image_r2_key = ?, cover_pos_x = ?, cover_pos_y = ?, cover_zoom = ?,
          read_time_minutes = ?, secret = ?, member_only = ?, license = ?, language = ?, region = ?, updated_at = ?
      `;
      const params = [title, subtitle || '', slug, compressedContent, excerpt, publishAs || 'personal',
        finalCollectionId, targetStatus, pageEmoji || '', storedCover, posX, posY, zoom, readTime, finalSecret, finalMemberOnly, finalLicense, discovery.language, discovery.region, now];

      if (publishedAt) {
        query += ', published_at = ?';
        params.push(publishedAt);
      }
      query += ' WHERE id = ?';
      params.push(slugid);

      const statements = [db.prepare(query).bind(...params)];
      if (normalizedTags) {
        statements.push(db.prepare('DELETE FROM blog_tags WHERE blog_id = ?').bind(slugid));
        for (const tag of normalizedTags) {
          statements.push(
            db.prepare('INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES (?, ?)').bind(slugid, tag)
          );
        }
      }
      // The public URL and its discovery metadata are one update. D1 batch keeps
      // the blog row and tags atomic, avoiding a live post with only half the change.
      await db.batch(statements);
    } else {
      // Create and publish in one step
      const statements = [db.prepare(`
        INSERT INTO blogs (id, slug, title, subtitle, content, excerpt, author_id, published_as, collection_id, status,
          page_emoji, cover_image_r2_key, cover_pos_x, cover_pos_y, cover_zoom, read_time_minutes, secret, member_only, license, language, region, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        slugid, slug, title, subtitle || '', compressedContent, excerpt,
        session.userId, publishAs || 'personal', finalCollectionId, targetStatus,
        pageEmoji || '', storedCover, posX, posY, zoom, readTime, finalSecret, finalMemberOnly, finalLicense, discovery.language, discovery.region, now, now,
        (targetStatus === 'published' || targetStatus === 'unlisted') ? now : null
      )];
      if (normalizedTags) {
        statements.push(db.prepare('DELETE FROM blog_tags WHERE blog_id = ?').bind(slugid));
        for (const tag of normalizedTags) {
          statements.push(
            db.prepare('INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES (?, ?)').bind(slugid, tag)
          );
        }
      }
      await db.batch(statements);
    }

    // A user may upload media before the first draft/publish request creates
    // the blog row. Attach those staged records once the FK target exists.
    await db.prepare(`
      UPDATE media_uploads SET blog_id = ?
      WHERE blog_id IS NULL AND user_id = ? AND cloudinary_public_id LIKE ?
    `).bind(slugid, session.userId, `lixblogs/${slugid}/%`).run();

    // Record a version snapshot for every publish/update (#11 E).
    if (compressedContent && targetStatus !== 'draft') {
      try { const { snapshotVersion } = await import('../../../../lib/blogVersions'); await snapshotVersion(db, slugid, compressedContent, { label: 'published', userId: session.userId }); } catch {}
    }

    // Refresh both reader-facing discovery caches and the sitemap. This runs for
    // publish, update, unlist, and draft transitions handled by this endpoint.
    try {
      const { invalidateBlogLifecycleCaches } = await import('../../../../lib/api/v1/blogCache');
      const { kvInvalidate, mediaInventoryCacheKey } = await import('../../../../lib/cache');
      await Promise.all([
        invalidateBlogLifecycleCaches(slugid),
        kvInvalidate(mediaInventoryCacheKey(session.userId)),
      ]);
    } catch {}

    // Canonical, scope-aware reader URL (personal / org / collection) keyed off
    // the PRIMARY author + org — not the publisher, so co-authors and org
    // publishers land on the right published URL, not their own profile.
    let url;
    try {
      const { getBlogCanonicalPath } = await import('../../../../lib/blogUrl');
      url = await getBlogCanonicalPath(db, slugid);
    } catch {
      url = `/${session.profile?.username || 'user'}/${slug}`;
    }

    if (targetStatus === 'published' || existing?.status === 'published') {
      const { notifySearchDiscovery } = await import('../../../../lib/searchDiscovery');
      notifySearchDiscovery(`https://blogs.elixpo.com${url}`);
    }

    // Collaboration invitations become actionable only when their reader URL
    // exists. The helper is status-gated and deduplicated, so ordinary updates
    // cannot create repeated notifications.
    if (targetStatus === 'published' || targetStatus === 'unlisted') {
      try {
        const { notifyPendingBlogCollaborators } = await import('../../../../lib/blogInviteNotifications');
        await notifyPendingBlogCollaborators(db, slugid, existing?.author_id || session.userId);
      } catch (e) {
        console.error('Failed to notify pending collaborators:', e?.message || e);
      }
    }

    return NextResponse.json({
      ok: true,
      slugid,
      slug,
      status: targetStatus,
      updatedAt: now,
      url,
    });
  } catch (e) {
    console.error('Publish error:', e);
    return NextResponse.json({ error: 'Failed to publish' }, { status: 500 });
  }
}

function normalizeTags(tags) {
  return [...new Set(tags
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))].slice(0, 5);
}

function validCoverUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

function generateSlug(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-|-$/g, '');
}

function countWords(blocks) {
  if (!blocks || !Array.isArray(blocks)) return 0;
  return blocks
    .map(b => (b.content && Array.isArray(b.content)) ? b.content.map(c => c.text || '').join('') : '')
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}
