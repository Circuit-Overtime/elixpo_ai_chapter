export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

// GET — list comments with replies
export async function GET(request, { params }) {
  const { slugid } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    // Get top-level comments
    const topLevel = await db.prepare(`
      SELECT c.id, c.content, c.parent_id, c.created_at, c.updated_at,
        u.id as user_id, u.username, u.display_name, u.avatar_url
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.blog_id = ? AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(slugid, limit, offset).all();

    const comments = topLevel?.results || [];

    // Get replies for all top-level comments (max 100 per parent)
    if (comments.length > 0) {
      const parentIds = comments.map(c => c.id);
      const placeholders = parentIds.map(() => '?').join(',');
      const replies = await db.prepare(`
        SELECT c.id, c.content, c.parent_id, c.created_at, c.updated_at,
          u.id as user_id, u.username, u.display_name, u.avatar_url
        FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.parent_id IN (${placeholders})
        ORDER BY c.created_at ASC
      `).bind(...parentIds).all();

      const replyMap = {};
      for (const r of (replies?.results || [])) {
        if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
        replyMap[r.parent_id].push(r);
      }

      for (const c of comments) {
        c.replies = (replyMap[c.id] || []).slice(0, 100);
        c.reply_count = (replyMap[c.id] || []).length;
      }

      // Attach @mention usernames per comment/reply so the client can linkify
      // only the tokens that resolved to real users (#10).
      const allIds = [];
      for (const c of comments) { allIds.push(c.id); for (const r of c.replies) allIds.push(r.id); }
      if (allIds.length) {
        // Guard: degrade gracefully if comment_mentions isn't migrated yet.
        try {
          const mp = allIds.map(() => '?').join(',');
          const mres = await db.prepare(`
            SELECT cm.comment_id, u.username
            FROM comment_mentions cm JOIN users u ON u.id = cm.user_id
            WHERE cm.comment_id IN (${mp})
          `).bind(...allIds).all();
          const byComment = {};
          for (const row of (mres?.results || [])) (byComment[row.comment_id] ||= []).push(row.username);
          for (const c of comments) {
            c.mentions = byComment[c.id] || [];
            for (const r of c.replies) r.mentions = byComment[r.id] || [];
          }
        } catch { /* table not migrated yet — skip mention linkification */ }
      }
    }

    const total = await db.prepare('SELECT COUNT(*) as c FROM comments WHERE blog_id = ? AND parent_id IS NULL').bind(slugid).first();

    // ── Secret posts: anonymous comments, readable only by the post's team ──
    // Two separate rules, both enforced HERE rather than in the UI:
    //   1. Identity is stripped for everyone — including the author and collaborators.
    //      A secret post's discussion must not out the people taking part in it, and
    //      being on the post's team doesn't entitle you to know who commented.
    //   2. The body is only sent to the post's team (author + accepted collaborators),
    //      plus each commenter's own comments back to them. Everyone else never
    //      receives the text at all — the client's blurred div is a placeholder for
    //      content that was never transmitted. Blurring in CSS would be theatre: the
    //      text would still be sitting in the network response.
    const blog = await db.prepare('SELECT author_id, secret FROM blogs WHERE id = ?').bind(slugid).first();
    if (blog?.secret) {
      const session = await getSession().catch(() => null);
      const viewerId = session?.userId || null;

      // The post's team = author + accepted collaborators. Pending/declined invites
      // grant nothing.
      let isTeam = !!viewerId && viewerId === blog.author_id;
      if (viewerId && !isTeam) {
        const co = await db.prepare(
          "SELECT 1 FROM blog_co_authors WHERE blog_id = ? AND user_id = ? AND status = 'accepted'"
        ).bind(slugid, viewerId).first();
        isTeam = !!co;
      }

      const redact = (c) => {
        const mine = !!viewerId && c.user_id === viewerId;
        const canRead = isTeam || mine;
        // The post's author is badged "Author" in their own thread. This admits they
        // are present — which readers can infer anyway once someone answers as the
        // writer — but it never says WHO they are: the byline stays "Anonymous" and
        // no identifying field is sent. Being honest about the role beats an
        // unlabelled author that readers can't distinguish from a stranger.
        const byAuthor = c.user_id === blog.author_id;
        return {
          ...c,
          user_id: undefined,
          username: null,
          display_name: 'Anonymous',
          avatar_url: null,
          mentions: [],
          content: canRead ? c.content : null,
          blurred: !canRead,
          is_mine: mine,
          is_post_author: byAuthor,
        };
      };
      const redacted = comments.map((c) => ({
        ...redact(c),
        replies: (c.replies || []).map(redact),
      }));
      return NextResponse.json({ comments: redacted, total: total?.c || 0, page, hasMore: comments.length === limit, secret: true });
    }

    return NextResponse.json({ comments, total: total?.c || 0, page, hasMore: comments.length === limit });
  } catch (e) {
    console.error('Comments fetch error:', e);
    return NextResponse.json({ comments: [], total: 0 });
  }
}

// POST — create comment or reply
export async function POST(request, { params }) {
  const { slugid } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { content, parentId } = await request.json();
  if (!content?.trim() || content.trim().length > 5000) {
    return NextResponse.json({ error: 'Comment must be 1-5000 characters' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    // Check blog allows comments
    const blog = await db.prepare('SELECT id, author_id, title, allow_comments, secret FROM blogs WHERE id = ?').bind(slugid).first();
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    if (!blog.allow_comments) return NextResponse.json({ error: 'Comments are disabled' }, { status: 403 });

    // If reply, validate parent
    if (parentId) {
      const parent = await db.prepare('SELECT id, parent_id, user_id FROM comments WHERE id = ? AND blog_id = ?').bind(parentId, slugid).first();
      if (!parent) return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      if (parent.parent_id) return NextResponse.json({ error: 'Cannot reply to a reply' }, { status: 400 });

      const replyCount = await db.prepare('SELECT COUNT(*) as c FROM comments WHERE parent_id = ?').bind(parentId).first();
      if ((replyCount?.c || 0) >= 100) return NextResponse.json({ error: 'Reply limit reached (100)' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Insert + counter increment atomically (D1 batch = transaction).
    await db.batch([
      db.prepare(`
        INSERT INTO comments (id, blog_id, user_id, parent_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, slugid, session.userId, parentId || null, content.trim(), now, now),
      db.prepare('UPDATE blogs SET comment_count = comment_count + 1 WHERE id = ?').bind(slugid),
    ]);
    // Invalidate cache
    try { const { kvInvalidate } = await import('../../../../../lib/cache'); await kvInvalidate(`v1:interactions:${slugid}`); } catch {}

    // Notify blog author (if not self)
    try {
      const user = await db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?').bind(session.userId).first();
      const { notify } = await import('../../../../../lib/notify');
      const { getBlogCanonicalPath } = await import('../../../../../lib/blogUrl');
      const blogUrl = await getBlogCanonicalPath(db, slugid);

      // Under a secret post the discussion is anonymous even to the post's author,
      // so the notification can't carry the commenter either — "alice commented on
      // your post" would undo every strip we do on the read path.
      const actor = blog.secret
        ? { actorId: null, actorName: 'Anonymous', actorAvatar: null }
        : { actorId: session.userId, actorName: user?.display_name || user?.username, actorAvatar: user?.avatar_url };

      if (blog.author_id !== session.userId) {
        await notify(db, {
          userId: blog.author_id, type: 'comment',
          ...actor, targetId: slugid,
          targetTitle: blog.title, targetUrl: blogUrl,
        });
      }

      const alreadyNotified = new Set([session.userId]);
      if (blog.author_id !== session.userId) alreadyNotified.add(blog.author_id);

      // Notify parent comment author if reply (and not self)
      if (parentId) {
        const parent = await db.prepare('SELECT user_id FROM comments WHERE id = ?').bind(parentId).first();
        if (parent && parent.user_id !== session.userId && parent.user_id !== blog.author_id) {
          alreadyNotified.add(parent.user_id);
          await notify(db, {
            userId: parent.user_id, type: 'mention',
            ...actor, targetId: slugid,
            targetTitle: blog.title, targetUrl: blogUrl,
          });
        }
      }

      // @mentions in the comment body (#10): resolve real usernames, record
      // them, and notify each mentioned user (skipping self / already-notified).
      const unames = [...new Set([...content.matchAll(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]+)/g)].map((m) => m[1].toLowerCase()))].slice(0, 20);
      if (unames.length) {
        const ph = unames.map(() => '?').join(',');
        const found = await db.prepare(`SELECT id, username FROM users WHERE LOWER(username) IN (${ph})`).bind(...unames).all();
        for (const u of (found?.results || [])) {
          try { await db.prepare('INSERT OR IGNORE INTO comment_mentions (comment_id, user_id) VALUES (?, ?)').bind(id, u.id).run(); } catch {}
          if (!alreadyNotified.has(u.id)) {
            alreadyNotified.add(u.id);
            await notify(db, {
              userId: u.id, type: 'mention',
              ...actor, targetId: slugid,
              targetTitle: blog.title, targetUrl: blogUrl,
            });
          }
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('Comment create error:', e);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}
