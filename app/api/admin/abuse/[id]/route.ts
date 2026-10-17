import { type NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB, getKV } from '@/lib/db';

export const runtime = 'edge';

const STATUSES = new Set(['reviewing', 'resolved', 'dismissed']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const reportId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(reportId)) return NextResponse.json({ error: 'Invalid report id' }, { status: 400 });
  const body = await request.json().catch(() => null) as { status?: string; quarantine?: boolean } | null;
  if (!body?.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Choose a valid review status' }, { status: 400 });
  }

  const db = getDB();
  const report = await db.prepare('SELECT short_code FROM abuse_reports WHERE id = ?')
    .bind(reportId).first<{ short_code: string }>();
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  if (body.quarantine) {
    await db.batch([
      db.prepare("UPDATE urls SET is_active = 0, updated_at = datetime('now') WHERE short_code = ?").bind(report.short_code),
      db.prepare('DELETE FROM guest_links WHERE short_code = ?').bind(report.short_code),
    ]);
    await getKV().delete(`url:${report.short_code}`);
  }

  await db.prepare(
    `UPDATE abuse_reports SET status = ?, resolution = ?, reviewed_by = ?,
       reviewed_at = datetime('now') WHERE id = ?`,
  ).bind(
    body.status,
    body.quarantine ? 'Link quarantined' : 'Reviewed without quarantine',
    user.id,
    reportId,
  ).run();
  await auditLog(user.id, 'abuse.review', 'url', report.short_code, body.status);
  return NextResponse.json({ success: true });
}
