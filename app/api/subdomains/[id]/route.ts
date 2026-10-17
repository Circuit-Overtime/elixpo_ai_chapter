import { NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { publicSubdomain } from '@/lib/subdomain-control';
import type { SubdomainRecord } from '@/lib/types';

export const runtime = 'edge';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid subdomain id' }, { status: 400 });

  const body = await request.json().catch(() => null) as { is_default?: unknown } | null;
  if (!body || body.is_default !== true) {
    return NextResponse.json({ error: 'is_default must be true' }, { status: 400 });
  }

  const db = getDB();
  const owned = await db
    .prepare("SELECT * FROM subdomains WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(id, user.id)
    .first<SubdomainRecord>();
  if (!owned) return NextResponse.json({ error: 'Active subdomain not found' }, { status: 404 });

  await db.batch([
    db.prepare('UPDATE subdomains SET is_default = 0 WHERE user_id = ? AND is_default = 1').bind(user.id),
    db.prepare("UPDATE subdomains SET is_default = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?").bind(id, user.id),
  ]);
  const updated = { ...owned, is_default: 1 };
  auditLog(user.id, 'subdomain.default', 'subdomain', String(id), owned.hostname).catch(() => {});
  return NextResponse.json({ subdomain: publicSubdomain(updated) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid subdomain id' }, { status: 400 });

  const db = getDB();
  const removed = await db
    .prepare(
      `UPDATE subdomains
       SET status = 'removed', is_default = 0, removed_at = datetime('now'),
           revision = revision + 1, updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status != 'removed'
       RETURNING *`,
    )
    .bind(id, user.id)
    .first<SubdomainRecord>();
  if (!removed) return NextResponse.json({ error: 'Subdomain not found' }, { status: 404 });

  auditLog(user.id, 'subdomain.remove', 'subdomain', String(id), removed.hostname).catch(() => {});
  return NextResponse.json({ success: true });
}
