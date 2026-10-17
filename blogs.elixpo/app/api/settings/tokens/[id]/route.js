export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { getDB } from '../../../../../lib/cloudflare';

export async function DELETE(_request, { params }) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 128) return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
  try {
    const result = await getDB().prepare(`
      UPDATE api_personal_access_tokens SET revoked_at = unixepoch()
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).bind(id, session.userId).run();
    if (!result?.meta?.changes) return NextResponse.json({ error: 'Token not found or already revoked' }, { status: 404 });
    return NextResponse.json({ ok: true, id, revoked: true });
  } catch (error) {
    console.error('[settings/tokens] revoke failed:', error?.message || error);
    return NextResponse.json({ error: 'The API token could not be revoked' }, { status: 500 });
  }
}
