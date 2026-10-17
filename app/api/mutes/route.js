export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

const TYPES = new Set(['author', 'org', 'tag']);

// GET — list the current user's mutes.
export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session?.userId) return NextResponse.json({ mutes: [] });
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    const res = await db.prepare('SELECT target_type, target_id FROM mutes WHERE user_id = ?').bind(session.userId).all();
    return NextResponse.json({ mutes: res?.results || [] });
  } catch {
    return NextResponse.json({ mutes: [] });
  }
}

// POST — mute { targetType, targetId }
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { targetType, targetId, blogId } = await request.json();
  if (!TYPES.has(targetType) || !targetId) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    if (targetType === 'author' && String(targetId) === session.userId) {
      return NextResponse.json({ error: 'Cannot mute yourself' }, { status: 400 });
    }
    if (targetType === 'org') {
      const owned = await db.prepare(`
        SELECT 1 FROM orgs o LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
        WHERE o.id = ? AND (o.owner_id = ? OR om.user_id IS NOT NULL)
      `).bind(session.userId, String(targetId), session.userId).first();
      if (owned) return NextResponse.json({ error: 'Cannot mute your own publication' }, { status: 400 });
    }
    if (targetType === 'tag' && blogId) {
      const { canEditBlog } = await import('../../../lib/permissions');
      if ((await canEditBlog(db, blogId, session.userId)).ok) {
        return NextResponse.json({ error: 'Cannot mute topics from your own story' }, { status: 400 });
      }
    }
    await db.prepare(
      'INSERT OR IGNORE INTO mutes (user_id, target_type, target_id) VALUES (?, ?, ?)'
    ).bind(session.userId, targetType, String(targetId)).run();
    if (targetType === 'tag') {
      await db.prepare('DELETE FROM user_interests WHERE user_id = ? AND LOWER(tag) = LOWER(?)')
        .bind(session.userId, String(targetId)).run();
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — unmute { targetType, targetId }
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { targetType, targetId } = await request.json();
  if (!TYPES.has(targetType) || !targetId) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  try {
    const { getDB } = await import('../../../lib/cloudflare');
    const db = getDB();
    await db.prepare('DELETE FROM mutes WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .bind(session.userId, targetType, String(targetId)).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
