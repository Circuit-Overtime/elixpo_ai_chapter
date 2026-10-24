export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { BLOG_LICENSES } from '../../../../lib/curatedCollections';

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const row = await getDB().prepare(`
      SELECT allow_public_curation, default_license FROM curation_preferences WHERE user_id = ?
    `).bind(session.userId).first();
    return NextResponse.json({
      allowPublicCuration: row?.allow_public_curation !== 0,
      defaultLicense: row?.default_license || 'all-rights-reserved',
    });
  } catch {
    return NextResponse.json({ error: 'Curation preference could not be loaded' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (body?.allowPublicCuration !== undefined && typeof body.allowPublicCuration !== 'boolean') {
    return NextResponse.json({ error: 'allowPublicCuration must be a boolean' }, { status: 400 });
  }
  if (body?.defaultLicense !== undefined && !BLOG_LICENSES.has(body.defaultLicense)) {
    return NextResponse.json({ error: 'Unsupported default license' }, { status: 400 });
  }
  if (body?.allowPublicCuration === undefined && body?.defaultLicense === undefined) {
    return NextResponse.json({ error: 'No preference was provided' }, { status: 400 });
  }
  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();
    const current = await db.prepare(`
      SELECT allow_public_curation, default_license FROM curation_preferences WHERE user_id = ?
    `).bind(session.userId).first();
    const allowPublicCuration = body.allowPublicCuration ?? (current?.allow_public_curation !== 0);
    const defaultLicense = body.defaultLicense || current?.default_license || 'all-rights-reserved';
    await db.prepare(`
      INSERT INTO curation_preferences (user_id, allow_public_curation, default_license, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        allow_public_curation = excluded.allow_public_curation,
        default_license = excluded.default_license,
        updated_at = unixepoch()
    `).bind(
      session.userId,
      allowPublicCuration ? 1 : 0,
      defaultLicense,
    ).run();
    return NextResponse.json({
      ok: true,
      allowPublicCuration,
      defaultLicense,
    });
  } catch {
    return NextResponse.json({ error: 'Curation preference could not be updated' }, { status: 500 });
  }
}
