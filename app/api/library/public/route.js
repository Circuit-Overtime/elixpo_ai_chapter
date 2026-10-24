export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { CURATED_ENTRY_SELECT, serializeCuratedEntry } from '../../../../lib/curatedCollections';

// GET /api/library/public?username=&slug= — a public reading list + its blogs.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const slug = searchParams.get('slug');
  if (!username || !slug) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const owner = await db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
    if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const list = await db.prepare(`
      SELECT id, name, description, introduction, cover_url, visibility, updated_at
      FROM bookmark_collections
      WHERE user_id = ? AND LOWER(slug) = LOWER(?) AND visibility IN ('public', 'unlisted')
    `).bind(owner.id, slug).first();
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rows = await db.prepare(`${CURATED_ENTRY_SELECT}
      WHERE ce.collection_id = ? AND b.status = 'published' AND b.secret = 0
        AND b.deleted_at IS NULL
      ORDER BY ce.position ASC, ce.added_at ASC
    `).bind(list.id).all();

    return NextResponse.json({
      owner: { username: owner.username, display_name: owner.display_name, avatar_url: owner.avatar_url },
      list: {
        id: list.id,
        name: list.name,
        description: list.description || '',
        introduction: list.introduction || '',
        cover_url: list.cover_url || null,
        visibility: list.visibility,
        updated_at: list.updated_at,
      },
      blogs: (rows?.results || []).map((row) => ({
        ...serializeCuratedEntry(row),
        id: row.blog_id,
        cover_image_r2_key: row.cover_image_r2_key,
        read_time_minutes: row.read_time_minutes,
        published_at: row.published_at,
        author_id: row.author_id,
        author_username: row.author_username,
        author_name: row.author_name,
        author_avatar: row.author_avatar,
        org_slug: row.org_slug,
        collection_slug: row.publication_collection_slug,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
