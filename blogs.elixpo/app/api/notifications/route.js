export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

// GET /api/notifications — fetch user's notifications
export async function GET(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get('limit') || '30', 10);
  const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
  if (!Number.isFinite(rawLimit) || rawLimit < 1 || !Number.isFinite(rawOffset) || rawOffset < 0) {
    return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 });
  }
  const limit = Math.min(rawLimit, 50);
  const offset = rawOffset;

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    const [notifications, unreadCount] = await Promise.all([
      db.prepare(`
        SELECT n.id, n.type, n.actor_id, n.actor_name, n.actor_avatar,
          n.target_id, n.target_title, n.target_url, n.read, n.created_at,
          CASE
            WHEN n.type = 'blog_invite' THEN COALESCE(bc.status, 'declined')
            ELSE NULL
          END AS invite_status
        FROM notifications n
        LEFT JOIN blogs b
          ON n.type = 'blog_invite' AND b.id = n.target_id
        LEFT JOIN blog_co_authors bc
          ON n.type = 'blog_invite'
          AND bc.blog_id = n.target_id
          AND bc.user_id = n.user_id
        WHERE n.user_id = ?
          AND (n.type <> 'blog_invite' OR b.status IN ('published', 'unlisted'))
        ORDER BY n.created_at DESC LIMIT ? OFFSET ?
      `).bind(session.userId, limit, offset).all(),
      db.prepare(`
        SELECT COUNT(*) AS c
        FROM notifications n
        LEFT JOIN blogs b
          ON n.type = 'blog_invite' AND b.id = n.target_id
        WHERE n.user_id = ? AND n.read = 0
          AND (n.type <> 'blog_invite' OR b.status IN ('published', 'unlisted'))
      `).bind(session.userId).first(),
    ]);

    return NextResponse.json({
      notifications: notifications?.results || [],
      unread: unreadCount?.c || 0,
    });
  } catch (e) {
    console.error('Notifications fetch error:', e);
    return NextResponse.json({ notifications: [], unread: 0 });
  }
}

// PUT /api/notifications — mark as read
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id, all , read } = await request.json();

  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();

    if (all) {
      await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
        .bind(session.userId).run();
    } else if (id) {
        const markRead = read === undefined ? true : read;

        await db.prepare(
          'UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?'
        )
          .bind(markRead ? 1 : 0, id, session.userId)
          .run();
      }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Notification mark-read error:', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
