export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

export async function GET() {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const prefs = await db.prepare(`
      SELECT *
      FROM notification_prefs
      WHERE user_id = ?
    `)
      .bind(session.userId)
      .first();

    return NextResponse.json(
      prefs || {
        follow_enabled: 1,
        comment_enabled: 1,
        like_enabled: 1,
        mention_enabled: 1,
        org_invite_enabled: 1,
        blog_invite_enabled: 1,
        blog_published_enabled: 1,
        email_enabled: 1,
      }
    );
  } catch (e) {
    console.error('Notification prefs GET error:', e);

    return NextResponse.json(
      { error: 'Failed to load preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request:Request) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare(`
    INSERT INTO notification_prefs (
        user_id,
        follow_enabled,
        comment_enabled,
        like_enabled,
        mention_enabled,
        org_invite_enabled,
        blog_invite_enabled,
        blog_published_enabled,
        email_enabled,
        updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET
        follow_enabled = excluded.follow_enabled,
        comment_enabled = excluded.comment_enabled,
        like_enabled = excluded.like_enabled,
        mention_enabled = excluded.mention_enabled,
        org_invite_enabled = excluded.org_invite_enabled,
        blog_invite_enabled = excluded.blog_invite_enabled,
        blog_published_enabled = excluded.blog_published_enabled,
        email_enabled = excluded.email_enabled,
        updated_at = unixepoch()
    `)
    .bind(
        session.userId,
        body.follow_enabled ? 1 : 0,
        body.comment_enabled ? 1 : 0,
        body.like_enabled ? 1 : 0,
        body.mention_enabled ? 1 : 0,
        body.org_invite_enabled ? 1 : 0,
        body.blog_invite_enabled ? 1 : 0,
        body.blog_published_enabled ? 1 : 0,
        body.email_enabled ? 1 : 0
    )
    .run();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Notification prefs PUT error:', e);

    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}