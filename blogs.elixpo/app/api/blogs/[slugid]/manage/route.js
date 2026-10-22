export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';
import { invalidateBlogLifecycleCaches } from '../../../../../lib/api/v1/blogCache';
import { getBlogCanonicalPath } from '../../../../../lib/blogUrl';
import { notifySearchDiscovery } from '../../../../../lib/searchDiscovery';

const ACTION_STATUS = { unlist: 'unlisted', archive: 'archived' };

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { slugid } = await params;
  const { action } = await request.json().catch(() => ({}));
  const status = ACTION_STATUS[action];
  if (!status) return NextResponse.json({ error: 'Action must be unlist or archive' }, { status: 400 });

  try {
    const db = getDB();
    const blog = await db.prepare('SELECT id, author_id FROM blogs WHERE id = ? AND deleted_at IS NULL').bind(slugid).first();
    if (!blog) return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    if (blog.author_id !== session.userId) {
      return NextResponse.json({ error: 'Only the blog owner can change its publication state' }, { status: 403 });
    }
    const publicUrl = `https://blogs.elixpo.com${await getBlogCanonicalPath(db, slugid)}`;
    await db.prepare('UPDATE blogs SET status = ?, updated_at = unixepoch() WHERE id = ?').bind(status, slugid).run();
    await invalidateBlogLifecycleCaches(slugid);
    notifySearchDiscovery(publicUrl);
    return NextResponse.json({ ok: true, id: slugid, status });
  } catch (error) {
    console.error('[blogs/manage] update failed:', error?.message || error);
    return NextResponse.json({ error: 'The blog could not be updated' }, { status: 500 });
  }
}
