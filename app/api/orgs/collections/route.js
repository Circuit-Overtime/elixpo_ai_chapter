export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// List collections for an org
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const collections = await db.prepare(`
      SELECT c.*, u.username as created_by_name,
        (SELECT COUNT(*) FROM blogs WHERE collection_id = c.id) as blog_count
      FROM collections c
      JOIN users u ON u.id = c.created_by
      WHERE c.org_id = ?
      ORDER BY c.created_at DESC
    `).bind(orgId).all();

    return NextResponse.json({ collections: collections?.results || [] });
  } catch {
    return NextResponse.json({ collections: [] });
  }
}

// Create collection
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, name, slug, description } = await request.json();
  if (!orgId || !name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Sanitize + validate the collection slug (alphanumeric, single hyphens, 6–48 chars).
  const { validateSlug } = await import('../../../../lib/slugify');
  const slugCheck = validateSlug(slug, { label: 'Collection slug' });
  if (!slugCheck.ok) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
  const cleanSlug = slugCheck.slug;

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    // Must be admin or maintain
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
      .bind(orgId, session.userId).first();
    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();

    if (org?.owner_id !== session.userId && myRole?.role !== 'admin' && myRole?.role !== 'maintain') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const colId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await db.prepare(`
      INSERT INTO collections (id, org_id, slug, name, description, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(colId, orgId, cleanSlug, name.trim(), description || '', session.userId, now, now).run();

    return NextResponse.json({ ok: true, id: colId, slug: cleanSlug });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Collection slug already exists in this org' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}

// Update collection
export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { collectionId, name, description, slug } = await request.json();
  if (!collectionId) return NextResponse.json({ error: 'Missing collectionId' }, { status: 400 });

  // Validate the new handle up-front (alphanumeric, single hyphens, 6–48 chars).
  let cleanSlug = null;
  if (typeof slug === 'string' && slug.trim()) {
    const { validateSlug } = await import('../../../../lib/slugify');
    const slugCheck = validateSlug(slug, { label: 'Collection handle' });
    if (!slugCheck.ok) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
    cleanSlug = slugCheck.slug;
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const col = await db.prepare('SELECT org_id, slug FROM collections WHERE id = ?').bind(collectionId).first();
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
      .bind(col.org_id, session.userId).first();
    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(col.org_id).first();

    if (org?.owner_id !== session.userId && myRole?.role !== 'admin' && myRole?.role !== 'maintain') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Handle rename: collections are unique per (org_id, slug). Reject a clash
    // before writing so the user gets a clear message, not a 500.
    if (cleanSlug && cleanSlug !== col.slug) {
      const clash = await db.prepare('SELECT 1 FROM collections WHERE org_id = ? AND slug = ? AND id != ?')
        .bind(col.org_id, cleanSlug, collectionId).first();
      if (clash) return NextResponse.json({ error: 'That handle is already used by another collection in this org' }, { status: 409 });
    }

    const now = Math.floor(Date.now() / 1000);
    try {
      await db.prepare('UPDATE collections SET name = COALESCE(?, name), description = COALESCE(?, description), slug = COALESCE(?, slug), updated_at = ? WHERE id = ?')
        .bind(name || null, description || null, cleanSlug, now, collectionId).run();
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        return NextResponse.json({ error: 'That handle is already used by another collection in this org' }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true, slug: cleanSlug || col.slug });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// Delete collection
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { collectionId } = await request.json();
  if (!collectionId) return NextResponse.json({ error: 'Missing collectionId' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    const col = await db.prepare('SELECT org_id FROM collections WHERE id = ?').bind(collectionId).first();
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(col.org_id).first();
    const myRole = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
      .bind(col.org_id, session.userId).first();

    if (org?.owner_id !== session.userId && myRole?.role !== 'admin' && myRole?.role !== 'maintain') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Unset collection_id on blogs in this collection
    await db.prepare('UPDATE blogs SET collection_id = NULL WHERE collection_id = ?').bind(collectionId).run();
    await db.prepare('DELETE FROM collections WHERE id = ?').bind(collectionId).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
