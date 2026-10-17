export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { requestTooLarge, byteLength, MAX_SUBPAGE_CONTENT_BYTES, MAX_SUBPAGES_PER_BLOG, MAX_CANVAS_PER_BLOG } from '../../../lib/limits';

// POST — create a new subpage
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { blogId, title, kind, metadata } = body;
  if (!blogId) return NextResponse.json({ error: 'Missing blogId' }, { status: 400 });

  const subpageKind = kind === 'canvas' ? 'canvas' : 'doc';

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    // Resolve the parent by canonical id OR human slug — in production the edit
    // URL carries the slug, so callers may pass either (#24). Sub-pages are
    // always stored under the canonical blog id.
    let blog = await db.prepare('SELECT id, author_id, secret FROM blogs WHERE id = ?').bind(blogId).first();
    if (!blog) {
      blog = await db.prepare('SELECT id, author_id, secret FROM blogs WHERE LOWER(slug) = LOWER(?) ORDER BY updated_at DESC LIMIT 1').bind(blogId).first();
    }
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    if (blog.author_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Secret posts get no sub-pages or canvases. They are a second surface with
    // their own storage, their own sharing rules and their own uploads — none of
    // which are covered by the anonymity work done on the post itself, so allowing
    // them would quietly reopen every hole we just closed.
    if (blog.secret) {
      return NextResponse.json(
        { error: 'Sub-pages and canvases are not available on secret posts.', secret: true },
        { status: 403 },
      );
    }
    const canonicalBlogId = blog.id;

    // Sub-pages are a Member feature — gate creation by tier.
    const { getLimits } = await import('../../../lib/tiers');
    const me = await db.prepare('SELECT tier FROM users WHERE id = ?').bind(session.userId).first();
    if (!getLimits(me?.tier).canUseSubpages) {
      return NextResponse.json({ error: 'Sub-pages are a Member feature.', upgrade: true }, { status: 402 });
    }

    // Cap sub-pages per kind: max 2 doc sub-pages and max 2 canvas sub-pages per blog.
    // (Nesting is structurally impossible — a sub-page's id is never a blogs row,
    //  so creating a sub-page "under" a sub-page 404s on the ownership check above.)
    const kindCap = subpageKind === 'canvas' ? MAX_CANVAS_PER_BLOG : MAX_SUBPAGES_PER_BLOG;
    const kindCount = await db.prepare(
      'SELECT COUNT(*) as n FROM subpages WHERE blog_id = ? AND kind = ?'
    ).bind(canonicalBlogId, subpageKind).first();
    if ((kindCount?.n ?? 0) >= kindCap) {
      const label = subpageKind === 'canvas' ? 'Canvas' : 'Sub-page';
      return NextResponse.json({ error: `${label} limit reached (max ${kindCap} per blog)` }, { status: 409 });
    }

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = Date.now();
    const initialContent = subpageKind === 'canvas' ? '' : '[]';
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    await db.prepare(
      'INSERT INTO subpages (id, blog_id, title, content, created_at, updated_at, kind, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, canonicalBlogId, title || 'Untitled', initialContent, now, now, subpageKind, metaStr).run();

    return NextResponse.json({ id, blogId: canonicalBlogId, title: title || 'Untitled', kind: subpageKind });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — list subpages for a blog, or fetch a single subpage by id
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId');
  const subpageId = searchParams.get('id');

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const { decompressBlogContent } = await import('../../../lib/compress');
    const db = getDB();

    if (subpageId) {
      const subpage = await db.prepare('SELECT * FROM subpages WHERE id = ?').bind(subpageId).first();
      if (!subpage) return NextResponse.json({ error: 'Subpage not found' }, { status: 404 });

      // Access control: published parent → any signed-in user may read;
      // draft/archived → only users who can edit the parent blog.
      const parent = await db.prepare('SELECT status FROM blogs WHERE id = ?').bind(subpage.blog_id).first();
      const isPublic = parent && (parent.status === 'published' || parent.status === 'unlisted');
      if (!isPublic) {
        const { canEditBlog } = await import('../../../lib/permissions');
        const perm = await canEditBlog(db, subpage.blog_id, session.userId);
        if (!perm.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Canvas scenes are stored as plain JSON strings (no gzip), docs are gzip-compressed.
      if (subpage.kind === 'canvas') {
        try { subpage.content = subpage.content ? JSON.parse(subpage.content) : null; } catch {}
      } else {
        try { subpage.content = decompressBlogContent(subpage.content); } catch {
          try { subpage.content = JSON.parse(subpage.content); } catch {}
        }
      }
      if (subpage.metadata) {
        try { subpage.metadata = JSON.parse(subpage.metadata); } catch {}
      }
      return NextResponse.json(subpage);
    }

    if (!blogId) return NextResponse.json({ error: 'Missing blogId or id' }, { status: 400 });

    // Accept id or slug (edit URLs use the slug in prod) — sub-pages are keyed
    // by the canonical blog id.
    let canonicalBlogId = blogId;
    const parentRow = await db.prepare('SELECT id FROM blogs WHERE id = ? OR LOWER(slug) = LOWER(?) ORDER BY (id = ?) DESC LIMIT 1')
      .bind(blogId, blogId, blogId).first();
    if (parentRow?.id) canonicalBlogId = parentRow.id;

    const { results } = await db.prepare(
      'SELECT id, blog_id, title, kind, created_at, updated_at FROM subpages WHERE blog_id = ? ORDER BY created_at ASC'
    ).bind(canonicalBlogId).all();

    return NextResponse.json({ subpages: results || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — update subpage content or title
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (requestTooLarge(request)) return NextResponse.json({ error: 'Request too large' }, { status: 413 });

  const body = await request.json();
  const { id, title, content, metadata } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (byteLength(content) > MAX_SUBPAGE_CONTENT_BYTES) {
    return NextResponse.json({ error: 'Content too large' }, { status: 413 });
  }

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const { compressBlogContent } = await import('../../../lib/compress');
    const db = getDB();

    const subpage = await db.prepare('SELECT blog_id, kind FROM subpages WHERE id = ?').bind(id).first();
    if (!subpage) return NextResponse.json({ error: 'Subpage not found' }, { status: 404 });

    // Verify blog ownership
    const blog = await db.prepare('SELECT author_id FROM blogs WHERE id = ?').bind(subpage.blog_id).first();
    if (!blog || blog.author_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = Date.now();
    const updates = [];
    const values = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (content !== undefined) {
      // Canvas: store scene JSON as plain text. Doc: gzip-compress like blogs.
      let serialized;
      if (subpage.kind === 'canvas') {
        serialized = typeof content === 'string' ? content : JSON.stringify(content);
      } else {
        serialized = typeof content === 'string' ? content : compressBlogContent(content);
      }
      updates.push('content = ?');
      values.push(serialized);
    }
    if (metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(metadata === null ? null : JSON.stringify(metadata));
    }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db.prepare(`UPDATE subpages SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove a subpage
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    const subpage = await db.prepare('SELECT blog_id FROM subpages WHERE id = ?').bind(id).first();
    if (!subpage) return NextResponse.json({ error: 'Subpage not found' }, { status: 404 });

    const blog = await db.prepare('SELECT author_id FROM blogs WHERE id = ?').bind(subpage.blog_id).first();
    if (!blog || blog.author_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.prepare('DELETE FROM subpages WHERE id = ?').bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
