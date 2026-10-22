export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import {
  COLLECTION_VISIBILITIES,
  getOwnedCollection,
  serializeCuratedCollection,
} from '../../../../../lib/curatedCollections';

export async function GET(_request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const collection = await getOwnedCollection(getDB(), id, session.userId);
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    return NextResponse.json({ collection: serializeCuratedCollection(collection) });
  } catch {
    return NextResponse.json({ error: 'Collection could not be loaded' }, { status: 500 });
  }
}

// PUT — rename collection
export async function PUT(request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, description, introduction, coverUrl, visibility } = await request.json();
  if (visibility !== undefined && !COLLECTION_VISIBILITIES.has(visibility)) {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare(`
      UPDATE bookmark_collections SET
        name = COALESCE(?, name), description = COALESCE(?, description),
        introduction = COALESCE(?, introduction), cover_url = COALESCE(?, cover_url),
        visibility = COALESCE(?, visibility),
        is_public = CASE WHEN ? IS NULL THEN is_public WHEN ? = 'public' THEN 1 ELSE 0 END,
        updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).bind(
      name?.trim() || null,
      typeof description === 'string' ? description.trim().slice(0, 500) : null,
      typeof introduction === 'string' ? introduction.trim().slice(0, 5000) : null,
      coverUrl || null,
      visibility || null,
      visibility || null,
      visibility || null,
      id,
      session.userId,
    ).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — delete collection (bookmarks get collection_id = NULL)
export async function DELETE(request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();

    await db.prepare('DELETE FROM bookmark_collections WHERE id = ? AND user_id = ?').bind(id, session.userId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
