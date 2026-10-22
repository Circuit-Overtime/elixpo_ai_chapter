export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';

async function getOrg(db, slug) {
  return db.prepare('SELECT id, owner_id FROM orgs WHERE LOWER(slug) = LOWER(?)').bind(slug).first();
}

async function canManage(db, orgId, userId) {
  const m = await db.prepare(
    "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role IN ('admin','maintain')"
  ).bind(orgId, userId).first();
  if (m) return true;
  const o = await db.prepare('SELECT 1 FROM orgs WHERE id = ? AND owner_id = ?').bind(orgId, userId).first();
  return !!o;
}

// GET — public: list an org's custom links.
export async function GET(request, { params }) {
  const { slug } = await params;
  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const org = await getOrg(db, slug);
    if (!org) return NextResponse.json({ links: [] });
    const rows = await db.prepare('SELECT name, url FROM org_links WHERE org_id = ? ORDER BY position').bind(org.id).all();
    return NextResponse.json({ links: rows?.results || [] });
  } catch {
    return NextResponse.json({ links: [] });
  }
}

// PUT — replace all links (admin/maintain). Body: { links: [{ name, url }, …] } (max 5).
export async function PUT(request, { params }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { links } = await request.json().catch(() => ({}));
  if (!Array.isArray(links)) return NextResponse.json({ error: 'links must be an array' }, { status: 400 });

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const org = await getOrg(db, slug);
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });
    if (!(await canManage(db, org.id, session.userId))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { normalizeHttpsUrl } = await import('../../../../../lib/validate');
    const clean = [];
    for (const l of links.slice(0, 5)) {
      const name = (l?.name || '').toString().trim().slice(0, 40);
      const url = normalizeHttpsUrl((l?.url || '').toString().trim());
      if (name && url) clean.push({ name, url });
    }

    const stmts = [db.prepare('DELETE FROM org_links WHERE org_id = ?').bind(org.id)];
    clean.forEach((l, i) => stmts.push(
      db.prepare('INSERT INTO org_links (org_id, position, name, url) VALUES (?, ?, ?, ?)').bind(org.id, i, l.name, l.url)
    ));
    await db.batch(stmts);

    return NextResponse.json({ ok: true, links: clean });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
