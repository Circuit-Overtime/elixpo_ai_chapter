export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../../lib/auth';
import {
  CURATED_ENTRY_SELECT,
  getOwnedCollection,
  getVisibleCollection,
  serializeCuratedEntry,
} from '../../../../../../lib/curatedCollections';

const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function dbConnection() {
  const { getDB } = await import('../../../../../../lib/cloudflare');
  return getDB();
}

export async function GET(_request, { params }) {
  const { id } = await params;
  const session = await getSession();
  try {
    const db = await dbConnection();
    const collection = await getVisibleCollection(db, { id, viewerId: session?.userId });
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

    const rows = await db.prepare(`${CURATED_ENTRY_SELECT}
      WHERE ce.collection_id = ? AND b.status = 'published' AND b.secret = 0
        AND b.deleted_at IS NULL
      ORDER BY ce.position ASC, ce.added_at ASC
    `).bind(collection.id).all();
    return NextResponse.json({ entries: (rows?.results || []).map(serializeCuratedEntry) });
  } catch (error) {
    console.error('[curated-collections] entries list failed:', error?.message || error);
    return NextResponse.json({ error: 'Collection entries could not be loaded' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body?.blogId) return NextResponse.json({ error: 'blogId is required' }, { status: 400 });

  try {
    const db = await dbConnection();
    const collection = await getOwnedCollection(db, id, session.userId);
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

    const blog = await db.prepare(`
      SELECT b.id, b.author_id, b.status, b.secret, b.deleted_at,
        COALESCE(cp.allow_public_curation, 1) AS allow_public_curation
      FROM blogs b
      LEFT JOIN curation_preferences cp ON cp.user_id = b.author_id
      WHERE b.id = ? OR b.slugid = ?
      LIMIT 1
    `).bind(body.blogId, body.blogId).first();
    if (!blog || blog.status !== 'published' || blog.secret || blog.deleted_at) {
      return NextResponse.json({ error: 'Only accessible public blogs can be added' }, { status: 404 });
    }
    if (!blog.allow_public_curation && blog.author_id !== session.userId) {
      return NextResponse.json({ error: 'The author does not allow third-party curation' }, { status: 403 });
    }

    const last = await db.prepare(`
      SELECT COALESCE(MAX(position), -1) AS position
      FROM curated_collection_entries WHERE collection_id = ?
    `).bind(id).first();
    await db.prepare(`
      INSERT INTO curated_collection_entries
        (collection_id, blog_id, added_by, position, curator_note, category, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(collection_id, blog_id) DO UPDATE SET
        curator_note = excluded.curator_note,
        category = excluded.category,
        updated_at = unixepoch()
    `).bind(
      id,
      blog.id,
      session.userId,
      Number(last?.position ?? -1) + 1,
      cleanText(body.curatorNote, 500),
      cleanText(body.category, 80),
    ).run();
    await db.prepare('UPDATE bookmark_collections SET updated_at = unixepoch() WHERE id = ?').bind(id).run();
    if (blog.author_id !== session.userId && collection.visibility !== 'private') {
      const { notify } = await import('../../../../../../lib/notify');
      await notify(db, {
        userId: blog.author_id,
        type: 'collection_add',
        actorId: session.userId,
        actorName: session.profile?.display_name || session.profile?.username,
        actorAvatar: session.profile?.avatar_url,
        targetId: collection.id,
        targetTitle: collection.name,
        targetUrl: `/${session.profile?.username || 'user'}/reads/${collection.slug}`,
      });
    }
    return NextResponse.json({ ok: true, blogId: blog.id }, { status: 201 });
  } catch (error) {
    console.error('[curated-collections] add entry failed:', error?.message || error);
    return NextResponse.json({ error: 'The blog could not be added to the collection' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  try {
    const db = await dbConnection();
    const collection = await getOwnedCollection(db, id, session.userId);
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

    if (Array.isArray(body.order)) {
      const unique = [...new Set(body.order.filter(value => typeof value === 'string'))];
      if (unique.length > 500) return NextResponse.json({ error: 'A collection supports at most 500 entries' }, { status: 400 });
      const statements = unique.map((blogId, index) => db.prepare(`
        UPDATE curated_collection_entries SET position = ?, updated_at = unixepoch()
        WHERE collection_id = ? AND blog_id = ?
      `).bind(index, id, blogId));
      if (statements.length) await db.batch(statements);
    } else if (body.blogId) {
      await db.prepare(`
        UPDATE curated_collection_entries
        SET curator_note = ?, category = ?, updated_at = unixepoch()
        WHERE collection_id = ? AND blog_id = ?
      `).bind(cleanText(body.curatorNote, 500), cleanText(body.category, 80), id, body.blogId).run();
    } else {
      return NextResponse.json({ error: 'Provide order or blogId' }, { status: 400 });
    }
    await db.prepare('UPDATE bookmark_collections SET updated_at = unixepoch() WHERE id = ?').bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[curated-collections] update entries failed:', error?.message || error);
    return NextResponse.json({ error: 'Collection entries could not be updated' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const blogId = new URL(request.url).searchParams.get('blogId');
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!blogId) return NextResponse.json({ error: 'blogId is required' }, { status: 400 });

  try {
    const db = await dbConnection();
    const collection = await db.prepare('SELECT user_id FROM bookmark_collections WHERE id = ?').bind(id).first();
    const blog = await db.prepare('SELECT author_id FROM blogs WHERE id = ? OR slugid = ? LIMIT 1').bind(blogId, blogId).first();
    if (!collection || !blog) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (collection.user_id !== session.userId && blog.author_id !== session.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const result = await db.prepare(`
      DELETE FROM curated_collection_entries WHERE collection_id = ? AND blog_id = ?
    `).bind(id, blog.id).run();
    if (!result?.meta?.changes) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    await db.prepare('UPDATE bookmark_collections SET updated_at = unixepoch() WHERE id = ?').bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[curated-collections] remove entry failed:', error?.message || error);
    return NextResponse.json({ error: 'The entry could not be removed' }, { status: 500 });
  }
}
