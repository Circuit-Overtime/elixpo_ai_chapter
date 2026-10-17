import { NextRequest, NextResponse } from 'next/server';
import { auditLog, getCurrentUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { isValidScopes, validateLength } from '@/lib/validate';

export const runtime = 'edge';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const limited = await rateLimit(request, 'cli:auth:approve', 20, 60);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in is required' }, { status: 401 });
  const { id } = await params;
  const db = getDB();
  const authRequest = await db.prepare(
    `SELECT id FROM cli_auth_requests
     WHERE id = ? AND user_id = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`,
  ).bind(id, user.id).first();
  if (!authRequest) {
    return NextResponse.json({ error: 'This CLI request is invalid or expired' }, { status: 404 });
  }

  let body: { name?: unknown; scopes?: unknown; expires_at?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameError = validateLength(name, 'Name', 1, 64);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  const scopes = typeof body.scopes === 'string' ? body.scopes : '';
  if (!isValidScopes(scopes)) {
    return NextResponse.json({ error: 'Choose read or read,write access' }, { status: 400 });
  }

  let expiresAt: string | null = null;
  if (typeof body.expires_at === 'string' && body.expires_at) {
    const timestamp = Date.parse(body.expires_at);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return NextResponse.json({ error: 'Expiry must be a future date' }, { status: 400 });
    }
    expiresAt = new Date(timestamp).toISOString();
  }

  const result = await db.prepare(
    `UPDATE cli_auth_requests
     SET status = 'approved', key_name = ?, scopes = ?, key_expires_at = ?, approved_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`,
  ).bind(name, scopes, expiresAt, id, user.id).run();
  if (!result.meta.changes) {
    return NextResponse.json({ error: 'This CLI request is no longer pending' }, { status: 409 });
  }
  auditLog(user.id, 'cli.auth.approve', 'cli_auth_request', id).catch(() => {});
  return NextResponse.json({ approved: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in is required' }, { status: 401 });
  const { id } = await params;
  await getDB().prepare(
    `UPDATE cli_auth_requests SET status = 'denied'
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
  ).bind(id, user.id).run();
  return NextResponse.json({ denied: true });
}
