export const runtime = 'edge';
import { NextResponse } from 'next/server';

// Admin moderation endpoint, called by the GitHub moderation workflow.
// Auth: shared secret in the `x-moderation-secret` header (fail closed).
//
// Body: { action: 'takedown' | 'dismiss', blogId }
//   takedown — HARD DELETE the blog (+ subpages, collab state, media) and email the author.
//   dismiss  — clear reports; restore visibility if it was auto-hidden (under_review → published).
export async function POST(request) {
  const secret = process.env.MODERATION_SECRET || '';
  const provided = request.headers.get('x-moderation-secret') || '';
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const action = String(body.action || '');
  const blogId = String(body.blogId || '');
  if (!blogId || !['takedown', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Missing/invalid action or blogId' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const blog = await db.prepare(
      `SELECT b.id, b.title, b.status, b.author_id, u.email AS author_email, u.display_name AS author_name
       FROM blogs b JOIN users u ON u.id = b.author_id WHERE b.id = ?`
    ).bind(blogId).first();
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    let publicUrl = null;
    if (blog.status === 'published' || blog.status === 'under_review') {
      const { getBlogCanonicalPath } = await import('../../../../lib/blogUrl');
      publicUrl = `https://blogs.elixpo.com${await getBlogCanonicalPath(db, blogId)}`;
    }

    if (action === 'dismiss') {
      await db.batch([
        db.prepare("UPDATE blogs SET status = 'published', updated_at = unixepoch() WHERE id = ? AND status = 'under_review'").bind(blogId),
        db.prepare("UPDATE reports SET status = 'dismissed' WHERE blog_id = ?").bind(blogId),
      ]);
      if (blog.status === 'under_review') {
        try {
          const { invalidateBlogLifecycleCaches } = await import('../../../../lib/api/v1/blogCache');
          await invalidateBlogLifecycleCaches(blogId);
        } catch {}
        const { notifySearchDiscovery } = await import('../../../../lib/searchDiscovery');
        notifySearchDiscovery(publicUrl);
      }
      return NextResponse.json({ ok: true, action: 'dismiss', restored: blog.status === 'under_review' });
    }

    // ── takedown: hard delete ──
    // Best-effort Cloudinary cleanup before the rows vanish.
    let mediaOwners = [];
    try {
      const media = await db.prepare(`
        SELECT user_id, cloudinary_public_id, storage_provider, storage_cloud_name
        FROM media_uploads WHERE blog_id = ?
      `).bind(blogId).all();
      if (media?.results?.length) {
        mediaOwners = media.results.map((item) => item.user_id);
        const { deleteTrackedMediaBatch } = await import('../../../../lib/mediaStorage');
        await deleteTrackedMediaBatch(db, media.results);
      }
    } catch (e) {
      console.error('Cloudinary cleanup failed (continuing):', e?.message || e);
    }

    // Delete FK-less children explicitly, then the blog (cascades tags/comments/
    // likes/claps/bookmarks/views/read_history/co_authors/reports; media_uploads → NULL).
    await db.batch([
      db.prepare('DELETE FROM subpages WHERE blog_id = ?').bind(blogId),
      db.prepare('DELETE FROM blog_collab_state WHERE blog_id = ?').bind(blogId),
      db.prepare('DELETE FROM media_uploads WHERE blog_id = ?').bind(blogId),
      db.prepare('DELETE FROM blogs WHERE id = ?').bind(blogId),
    ]);
    try {
      const { recalculatePlatformStorage } = await import('../../../../lib/mediaStorage');
      await recalculatePlatformStorage(db, mediaOwners);
    } catch {}
    try {
      const { kvInvalidate, mediaInventoryCacheKey } = await import('../../../../lib/cache');
      await kvInvalidate(...[...new Set(mediaOwners)].map(mediaInventoryCacheKey));
    } catch {}
    try {
      const { invalidateBlogLifecycleCaches } = await import('../../../../lib/api/v1/blogCache');
      await invalidateBlogLifecycleCaches(blogId);
    } catch {}
    if (publicUrl) {
      const { notifySearchDiscovery } = await import('../../../../lib/searchDiscovery');
      notifySearchDiscovery(publicUrl);
    }

    // Notify the author by email (best-effort).
    if (blog.author_email) {
      try {
        const { sendBlogRemoved } = await import('../../../../lib/email');
        await sendBlogRemoved(blog.author_email, { displayName: blog.author_name || '', title: blog.title || 'your post' });
      } catch (e) {
        console.error('Removal email failed:', e?.message || e);
      }
    }

    return NextResponse.json({ ok: true, action: 'takedown', deleted: true });
  } catch (e) {
    console.error('Moderation action error:', e?.message || e);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
