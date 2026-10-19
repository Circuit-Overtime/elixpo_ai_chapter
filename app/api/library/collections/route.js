export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import {
  COLLECTION_VISIBILITIES,
  collectionSlug,
  curatedCoverUrl,
  serializeCuratedCollection,
} from '../../../../lib/curatedCollections';

// GET — list the user's reading lists (collections).
export async function GET() {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const collections = await db.prepare(`
      SELECT bc.*,
        (SELECT COUNT(*) FROM curated_collection_entries ce WHERE ce.collection_id = bc.id) as entry_count
      FROM bookmark_collections bc WHERE bc.user_id = ?
      ORDER BY bc.updated_at DESC, bc.name
    `).bind(session.userId).all();
    const defaultCount = await db.prepare(
      'SELECT COUNT(*) as c FROM bookmarks WHERE user_id = ? AND collection_id IS NULL'
    ).bind(session.userId).first();
    return NextResponse.json({
      collections: [
        { id: 'default', name: 'Saved posts', description: '', slug: 'saved-posts', visibility: 'private', count: defaultCount?.c || 0, isDefault: true },
        ...(collections?.results || []).map(serializeCuratedCollection),
      ],
    });
  } catch {
    return NextResponse.json({ collections: [] });
  }
}

// POST — create a reading list { name, description?, isPublic? }
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { name, description, introduction, coverUrl, visibility = 'private' } = await request.json();
  const slugBase = collectionSlug(name);
  if (!name?.trim() || slugBase.length < 3) return NextResponse.json({ error: 'Collection name must be at least 3 characters' }, { status: 400 });
  if (!COLLECTION_VISIBILITIES.has(visibility)) return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
  let cleanCoverUrl;
  try { cleanCoverUrl = curatedCoverUrl(coverUrl); } catch { return NextResponse.json({ error: 'Cover URL must use HTTPS' }, { status: 400 }); }
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const count = await db.prepare('SELECT COUNT(*) as c FROM bookmark_collections WHERE user_id = ?').bind(session.userId).first();
    if ((count?.c || 0) >= 50) return NextResponse.json({ error: 'Max 50 lists' }, { status: 400 });

    // Unique slug within this user's lists.
    let base = slugBase, slug = base, n = 1;
    while (await db.prepare('SELECT 1 FROM bookmark_collections WHERE user_id = ? AND slug = ?').bind(session.userId, slug).first()) {
      slug = `${base}-${++n}`;
    }
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO bookmark_collections
        (id, user_id, name, description, introduction, cover_url, slug, is_public, visibility, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `).bind(
      id, session.userId, name.trim(), (description || '').trim().slice(0, 500),
      (introduction || '').trim().slice(0, 5000), cleanCoverUrl, slug,
      visibility === 'public' ? 1 : 0, visibility,
    ).run();
    return NextResponse.json({
      ok: true,
      collection: { id, name: name.trim(), slug, description: (description || '').trim(), introduction: (introduction || '').trim(), coverUrl: cleanCoverUrl, visibility, count: 0 },
    }, { status: 201 });
  } catch (e) {
    if (e?.message?.includes('UNIQUE')) return NextResponse.json({ error: 'List name already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH — update a list { id, name?, isPublic? }
export async function PATCH(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id, name, description, introduction, coverUrl, visibility, isPublic } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const sets = [], binds = [];
    if (typeof name === 'string' && name.trim()) {
      const slug = collectionSlug(name);
      if (slug.length < 3) return NextResponse.json({ error: 'Collection name must be at least 3 characters' }, { status: 400 });
      sets.push('name = ?', 'slug = ?'); binds.push(name.trim(), slug);
    }
    if (typeof description === 'string') { sets.push('description = ?'); binds.push(description.trim().slice(0, 500)); }
    if (typeof introduction === 'string') { sets.push('introduction = ?'); binds.push(introduction.trim().slice(0, 5000)); }
    if (typeof coverUrl === 'string' || coverUrl === null) {
      let cleanCoverUrl;
      try { cleanCoverUrl = curatedCoverUrl(coverUrl); } catch { return NextResponse.json({ error: 'Cover URL must use HTTPS' }, { status: 400 }); }
      sets.push('cover_url = ?'); binds.push(cleanCoverUrl);
    }
    const requestedVisibility = typeof visibility === 'string'
      ? visibility
      : typeof isPublic !== 'undefined' ? (isPublic ? 'public' : 'private') : null;
    if (requestedVisibility) {
      if (!COLLECTION_VISIBILITIES.has(requestedVisibility)) return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
      sets.push('visibility = ?', 'is_public = ?');
      binds.push(requestedVisibility, requestedVisibility === 'public' ? 1 : 0);
    }
    if (!sets.length) return NextResponse.json({ ok: true });
    sets.push('updated_at = unixepoch()');
    await db.prepare(`UPDATE bookmark_collections SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...binds, id, session.userId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — remove a list (?id=); its bookmarks fall back to the default list.
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    await db.prepare('DELETE FROM bookmark_collections WHERE id = ? AND user_id = ?').bind(id, session.userId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
