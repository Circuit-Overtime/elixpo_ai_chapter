export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { decompressBlogContent } from '../../../../../lib/compress';

function presentRevision(row) {
  let content = [];
  try {
    const parsed = decompressBlogContent(row.content);
    if (Array.isArray(parsed)) content = parsed;
  } catch {}
  return {
    id: row.id,
    created_at: row.created_at,
    content,
  };
}

export async function GET(request, { params }) {
  const { slugid } = await params;

  try {
    const { getDB } = await import('../../../../../lib/cloudflare');
    const db = getDB();
    const blog = await db.prepare(`
      SELECT id FROM blogs
      WHERE id = ? AND status IN ('published', 'unlisted')
        AND secret = 0 AND COALESCE(member_only, 0) = 0 AND deleted_at IS NULL
    `).bind(slugid).first();
    if (!blog) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const versionId = new URL(request.url).searchParams.get('version');
    if (!versionId) {
      const rows = await db.prepare(`
        SELECT id, created_at FROM blog_versions WHERE blog_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 30
      `).bind(slugid).all();
      return NextResponse.json({
        versions: (rows?.results || []).reverse(),
      });
    }

    const revision = await db.prepare(`
      SELECT id, content, created_at FROM blog_versions WHERE id = ? AND blog_id = ?
    `).bind(versionId, slugid).first();
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      revision: presentRevision(revision),
    });
  } catch (error) {
    console.error('Public revision timeline error:', error?.message || error);
    return NextResponse.json({ error: 'Revision history is unavailable' }, { status: 500 });
  }
}
