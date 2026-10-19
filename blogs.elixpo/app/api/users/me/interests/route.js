export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

const normalizeTags = value => [...new Set((Array.isArray(value) ? value : [])
  .map(tag => String(tag).trim().toLowerCase())
  .filter(tag => tag && tag.length <= 64))].slice(0, 20);

// GET — list user's interests
export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const result = await db.prepare(
      'SELECT tag FROM user_interests WHERE user_id = ? ORDER BY tag'
    ).bind(session.userId).all();

    return NextResponse.json({ interests: (result?.results || []).map(r => r.tag) });
  } catch {
    return NextResponse.json({ interests: [] });
  }
}

// Add and/or remove individual interests without replacing the rest.
export async function PATCH(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const add = normalizeTags(body.add);
  const remove = normalizeTags(body.remove);
  if (!add.length && !remove.length) return NextResponse.json({ error: 'Provide topics to add or remove' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const current = await db.prepare('SELECT tag FROM user_interests WHERE user_id = ?').bind(session.userId).all();
    const next = new Set((current?.results || []).map(row => String(row.tag).toLowerCase()));
    remove.forEach(tag => next.delete(tag));
    for (const tag of add) {
      if (next.size >= 20 && !next.has(tag)) {
        return NextResponse.json({ error: 'You can follow up to 20 topics' }, { status: 409 });
      }
      next.add(tag);
    }

    const statements = [db.prepare('DELETE FROM user_interests WHERE user_id = ?').bind(session.userId)];
    for (const tag of next) statements.push(db.prepare('INSERT INTO user_interests (user_id, tag) VALUES (?, ?)').bind(session.userId, tag));
    for (const tag of add) statements.push(db.prepare("DELETE FROM mutes WHERE user_id = ? AND target_type = 'tag' AND LOWER(target_id) = ?").bind(session.userId, tag));
    await db.batch(statements);
    return NextResponse.json({ ok: true, interests: [...next].sort() });
  } catch (error) {
    console.error('Patch interests error:', error);
    return NextResponse.json({ error: 'Failed to update interests' }, { status: 500 });
  }
}

// PUT — replace all interests
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { interests } = await request.json();
  if (!Array.isArray(interests)) {
    return NextResponse.json({ error: 'interests must be an array' }, { status: 400 });
  }

  // Max 20 interests
  const tags = normalizeTags(interests).slice(0, 20);

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    // Delete existing + insert new
    await db.prepare('DELETE FROM user_interests WHERE user_id = ?').bind(session.userId).run();

    if (tags.length > 0) {
      const placeholders = tags.map(() => '(?, ?)').join(', ');
      const binds = tags.flatMap(tag => [session.userId, tag]);
      await db.prepare(`INSERT INTO user_interests (user_id, tag) VALUES ${placeholders}`).bind(...binds).run();
    }

    return NextResponse.json({ ok: true, interests: tags });
  } catch (e) {
    console.error('Update interests error:', e);
    return NextResponse.json({ error: 'Failed to update interests' }, { status: 500 });
  }
}
