export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

// Granular org search with selectable fields
// ?q=query&fields=id,slug,name,tagline,logo_url,description,members,blogs,collections
//
// Private orgs are excluded from search for everyone except their own members
// (and owner) — you should still be able to find the org you belong to.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const fields = (searchParams.get('fields') || 'id,slug,name,logo_url').split(',').map(f => f.trim());
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);

  if (!q || q.length < 2) {
    return NextResponse.json({ orgs: [] });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const pattern = `%${q}%`;

    const session = await getSession().catch(() => null);
    const viewerId = session?.userId || null;

    // A signed-out viewer binds NULL here: both `owner_id = NULL` and the IN
    // subquery yield no match, so they see public orgs only.
    const base = await db.prepare(`
      SELECT id, slug, name, tagline, description, logo_url, bio, website, visibility, owner_id, created_at
      FROM orgs
      WHERE (LOWER(slug) LIKE ? OR LOWER(name) LIKE ? OR LOWER(tagline) LIKE ?)
        AND (
          visibility != 'private'
          OR owner_id = ?
          OR id IN (SELECT org_id FROM org_members WHERE user_id = ?)
        )
      LIMIT ?
    `).bind(pattern, pattern, pattern, viewerId, viewerId, limit).all();

    const orgs = base?.results || [];

    if (orgs.length > 0) {
      for (const o of orgs) {
        if (fields.includes('members')) {
          const mc = await db.prepare('SELECT COUNT(*) as c FROM org_members WHERE org_id = ?').bind(o.id).first();
          o.member_count = mc?.c || 0;
        }
        if (fields.includes('blogs')) {
          const bc = await db.prepare("SELECT COUNT(*) as c FROM blogs WHERE published_as = ? AND status = 'published'").bind(`org:${o.id}`).first();
          o.blog_count = bc?.c || 0;
        }
        if (fields.includes('collections')) {
          const cc = await db.prepare('SELECT COUNT(*) as c FROM collections WHERE org_id = ?').bind(o.id).first();
          o.collection_count = cc?.c || 0;
        }
      }
    }

    return NextResponse.json({ orgs });
  } catch {
    return NextResponse.json({ orgs: [] });
  }
}
