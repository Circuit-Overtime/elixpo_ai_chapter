import { NextRequest, NextResponse } from 'next/server';
import { resolveUser, auditLog } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';

export const runtime = 'edge';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const keyId = parseInt(id);
  const db = getDB();

  const key = await db.prepare('SELECT id, key_prefix FROM api_keys WHERE id = ? AND user_id = ?')
    .bind(keyId, user.id).first<{ id: number; key_prefix: string }>();
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').bind(keyId).run();
  await auditLog(user.id, 'apikey.revoke', 'api_key', key.key_prefix);

  return NextResponse.json({ success: true });
}
