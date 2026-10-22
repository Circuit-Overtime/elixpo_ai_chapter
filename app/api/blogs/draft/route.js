export const runtime = 'edge';
// Per-user editor data — must never be cached (CDN or browser), or one user can
// get a stale/empty copy and the editor falls back to a local draft.
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { requestTooLarge, byteLength, MAX_BLOG_CONTENT_BYTES } from '../../../../lib/limits';
import { contentDiscoveryMetadata } from '../../../../lib/recommendations';

// Never let any editor-data response be cached — a signed-out 401 (or one
// user's data) must not be replayed to another state/user from cache.
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// GET — fetch blog data for editing
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });

  const { searchParams } = new URL(request.url);
  const slugid = searchParams.get('slugid');
  if (!slugid) return NextResponse.json({ error: 'Missing slugid' }, { status: 400, headers: NO_STORE });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { decompressBlogContent } = await import('../../../../lib/compress');
    const db = getDB();

    const COLS = 'id, slug, title, subtitle, content, cover_image_r2_key, cover_pos_x, cover_pos_y, cover_zoom, author_id, published_as, status, page_emoji, collection_id, secret, member_only, language, region';

    // The param may be the canonical id (new blogs) or the human slug (edit links).
    // Resolve by id first; otherwise by slug scoped to a blog THIS user can edit
    // (slugs are unique per owner, so the user disambiguates it).
    let blog = await db.prepare(`SELECT ${COLS} FROM blogs WHERE id = ?`).bind(slugid).first();
    if (!blog) {
      blog = await db.prepare(`
        SELECT ${COLS} FROM blogs b
        WHERE LOWER(b.slug) = LOWER(?)
          AND (
            b.author_id = ?
            OR b.id IN (SELECT blog_id FROM blog_co_authors WHERE user_id = ? AND status = 'accepted')
            OR (b.published_as LIKE 'org:%' AND substr(b.published_as, 5) IN (
                  SELECT org_id FROM org_members WHERE user_id = ? AND role IN ('admin','maintain','write')))
          )
        ORDER BY b.updated_at DESC LIMIT 1
      `).bind(slugid, session.userId, session.userId, session.userId).first();
    }

    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404, headers: NO_STORE });

    const blogId = blog.id;

    // Edit permission: author, org write+, or accepted co-author.
    const { canEditBlog } = await import('../../../../lib/permissions');
    const perm = await canEditBlog(db, blogId, session.userId);
    if (!perm.ok) {
      // If the user has a co-author invite on this blog, surface it so the
      // client can render an accept/decline gate instead of a blank editor.
      const invite = await db.prepare(
        'SELECT role, status FROM blog_co_authors WHERE blog_id = ? AND user_id = ?'
      ).bind(blogId, session.userId).first();
      if (invite) {
        return NextResponse.json({
          error: 'Not authorized',
          invite: {
            blogId,
            slug: blog.slug,
            title: blog.title,
            role: invite.role,
            status: invite.status,
          },
        }, { status: 403, headers: NO_STORE });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403, headers: NO_STORE });
    }

    // Decompress content
    let content = blog.content;
    try { content = decompressBlogContent(content); } catch {
      try { content = JSON.parse(content); } catch {}
    }

    // Get tags
    const tags = await db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ?').bind(blogId).all();

    // Get version info
    const { getBlogVersionInfo } = await import('../../../../lib/blog-version');
    const version = await getBlogVersionInfo(db, blogId);

    // Owner = personal author or org admin/owner. Only the owner may change the slug.
    let isOwner = blog.author_id === session.userId;
    if (!isOwner && blog.published_as?.startsWith('org:')) {
      const orgId = blog.published_as.slice(4);
      const adminRow = await db
        .prepare("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role = 'admin'")
        .bind(orgId, session.userId).first();
      const ownerRow = adminRow || await db
        .prepare('SELECT 1 FROM orgs WHERE id = ? AND owner_id = ?')
        .bind(orgId, session.userId).first();
      isOwner = !!ownerRow;
    }

    // The real author — so collaborators see the actual owner in publish settings,
    // not themselves.
    const author = await db.prepare('SELECT username, display_name, avatar_url, tier FROM users WHERE id = ?')
      .bind(blog.author_id).first();
    const { getLimits } = await import('../../../../lib/tiers');
    const { getBlogCanonicalPath } = await import('../../../../lib/blogUrl');
    const canonicalUrl = blog.status === 'published'
      ? await getBlogCanonicalPath(db, blogId)
      : null;

    return NextResponse.json({
      blog: {
        ...blog,
        content,
        tags: (tags?.results || []).map(t => t.tag),
        is_owner: isOwner,
        owner_username: author?.username || null,
        owner_display_name: author?.display_name || null,
        owner_avatar: author?.avatar_url || null,
        can_mark_member_only: getLimits(author?.tier).canMarkMemberOnly,
        member_only: !!blog.member_only,
        canonical_url: canonicalUrl,
      },
      version,
    }, { headers: NO_STORE });
  } catch (e) {
    console.error('Draft fetch error:', e);
    return NextResponse.json({ error: 'Failed to load blog' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (requestTooLarge(request)) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  const body = await request.json();
  const { slugid, title, subtitle, tags, publishAs, editorContent, pageEmoji, coverPreview, coverPos, coverZoom, secret, member_only, language, region } = body;
  const storedCover = validCoverUrl(coverPreview);
  const posX = Number.isFinite(coverPos?.x) ? coverPos.x : 50;
  const posY = Number.isFinite(coverPos?.y) ? coverPos.y : 50;
  const zoom = Number.isFinite(coverZoom) ? coverZoom : 1;

  if (!slugid) {
    return NextResponse.json({ error: 'Missing slugid' }, { status: 400 });
  }
  if (byteLength(editorContent) > MAX_BLOG_CONTENT_BYTES) {
    return NextResponse.json({ error: 'Content too large' }, { status: 413 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const { compressBlogContent } = await import('../../../../lib/compress');
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    // Compress content before storing
    const compressedContent = editorContent ? compressBlogContent(editorContent) : '';
    const { excerptFromBlocks } = await import('../../../../lib/excerpt');
    const excerpt = editorContent ? excerptFromBlocks(editorContent) : '';

    // Check if blog exists
    const existing = await db.prepare('SELECT id, author_id, status, secret, member_only, language, region FROM blogs WHERE id = ?').bind(slugid).first();
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(existing?.author_id || session.userId).first();
    const discovery = contentDiscoveryMetadata({
      language: language ?? existing?.language,
      region: region ?? existing?.region,
      locale: profile?.locale,
      headers: request.headers,
    });

    // Same lock as /publish: secret is free to toggle while the post is a draft and
    // frozen once it has been public. Autosave must never be able to flip it either.
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

    if (existing) {
      // Edit permission: author, org write+, or accepted co-author.
      const { canEditBlog } = await import('../../../../lib/permissions');
      const perm = await canEditBlog(db, slugid, session.userId);
      if (!perm.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      await db.prepare(`
        UPDATE blogs SET title = ?, subtitle = ?, content = ?, excerpt = ?, published_as = ?,
          page_emoji = ?, cover_image_r2_key = ?, cover_pos_x = ?, cover_pos_y = ?, cover_zoom = ?, secret = ?, member_only = ?, language = ?, region = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        title || '', subtitle || '', compressedContent, excerpt, publishAs || 'personal',
        pageEmoji || '', storedCover, posX, posY, zoom, finalSecret, finalMemberOnly, discovery.language, discovery.region, now, slugid
      ).run();
      // Throttled version snapshot (≤ 1 / 5 min) so history accrues as people edit (#11 E).
      if (compressedContent) {
        try { const { snapshotVersion } = await import('../../../../lib/blogVersions'); await snapshotVersion(db, slugid, compressedContent, { label: 'autosave', userId: session.userId, throttleSeconds: 300 }); } catch {}
      }
    } else {
      const { ensureUniqueBlogSlug } = await import('../../../../lib/namespace');
      const baseSlug = generateSlug(title);
      const slug = await ensureUniqueBlogSlug(db, baseSlug, slugid, {
        authorId: session.userId,
        publishAs: publishAs || 'personal',
      });
      await db.prepare(`
        INSERT INTO blogs (id, slug, title, subtitle, content, excerpt, author_id, published_as, status, page_emoji, cover_image_r2_key, cover_pos_x, cover_pos_y, cover_zoom, secret, member_only, language, region, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        slugid, slug, title || '', subtitle || '', compressedContent, excerpt,
        session.userId, publishAs || 'personal', pageEmoji || '', storedCover, posX, posY, zoom, finalSecret, finalMemberOnly, discovery.language, discovery.region, now, now
      ).run();
      if (compressedContent) {
        try {
          const { snapshotVersion } = await import('../../../../lib/blogVersions');
          await snapshotVersion(db, slugid, compressedContent, { label: 'draft', userId: session.userId });
        } catch {}
      }
    }

    // Media can be uploaded before a brand-new draft row exists. Associate
    // those staged assets now that the blog satisfies the foreign key.
    await db.prepare(`
      UPDATE media_uploads SET blog_id = ?
      WHERE blog_id IS NULL AND user_id = ? AND cloudinary_public_id LIKE ?
    `).bind(slugid, session.userId, `lixblogs/${slugid}/%`).run();
    try {
      const { kvInvalidate, mediaInventoryCacheKey } = await import('../../../../lib/cache');
      await kvInvalidate(mediaInventoryCacheKey(session.userId));
    } catch {}

    // Autosave can edit an already-published post. Its title, tags, slug-adjacent
    // metadata, and updated timestamp must reach the sitemap without waiting for
    // the cache TTL. New drafts do not belong in public discovery.
    if (existing && existing.status === 'published') {
      try {
        const { invalidateBlogLifecycleCaches } = await import('../../../../lib/api/v1/blogCache');
        await invalidateBlogLifecycleCaches(slugid);
      } catch {}
    }

    // Sync tags
    if (Array.isArray(tags)) {
      const normalizedTags = normalizeTags(tags);
      await db.prepare('DELETE FROM blog_tags WHERE blog_id = ?').bind(slugid).run();
      for (const tag of normalizedTags) {
        await db.prepare('INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES (?, ?)')
          .bind(slugid, tag).run();
      }
    }

    // Return the new updated_at so the client can keep lastKnownUpdatedAt in
    // sync — otherwise the author's own background sync looks like a conflict.
    return NextResponse.json({ ok: true, slugid, updatedAt: now });
  } catch (e) {
    console.error('Draft save error:', e);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
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
