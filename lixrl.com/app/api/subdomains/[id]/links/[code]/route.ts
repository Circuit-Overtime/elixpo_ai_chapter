import { NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { bumpSubdomainRevision } from '@/lib/subdomain-control';

export const runtime = 'edge';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; code: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const resolved = await params;
  const id = Number(resolved.id);
  const result = await getDB()
    .prepare(
      `DELETE FROM subdomain_links
       WHERE subdomain_id = ? AND short_code = ?
         AND subdomain_id IN (SELECT id FROM subdomains WHERE user_id = ?)
       RETURNING id`,
    )
    .bind(id, resolved.code.toLowerCase(), user.id)
    .first<{ id: number }>();
  if (!result) return NextResponse.json({ error: 'Mapped link not found' }, { status: 404 });
  await bumpSubdomainRevision(getDB(), id);
  auditLog(user.id, 'subdomain.unlink', 'subdomain', String(id), resolved.code).catch(() => {});
  return NextResponse.json({ success: true });
}
