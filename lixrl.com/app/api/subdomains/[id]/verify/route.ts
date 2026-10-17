import { NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { publicSubdomain } from '@/lib/subdomain-control';
import { generateVerificationToken, subdomainEntitlement, verificationExpiry } from '@/lib/subdomains';
import type { SubdomainRecord } from '@/lib/types';

export const runtime = 'edge';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (subdomainEntitlement(user.tier) === 0) {
    return NextResponse.json({ error: 'An active paid plan is required' }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid subdomain id' }, { status: 400 });
  const db = getDB();
  let record = await db
    .prepare("SELECT * FROM subdomains WHERE id = ? AND user_id = ? AND status IN ('pending', 'failed', 'verified', 'suspended')")
    .bind(id, user.id)
    .first<SubdomainRecord>();
  if (!record) return NextResponse.json({ error: 'Subdomain cannot be verified' }, { status: 404 });

  if (Date.parse(record.verification_expires_at) <= Date.now()) {
    record = await db
      .prepare(
        `UPDATE subdomains SET status = 'pending', verification_token = ?,
         verification_expires_at = ?, last_error = NULL, updated_at = datetime('now')
         WHERE id = ? RETURNING *`,
      )
      .bind(generateVerificationToken(), verificationExpiry(), id)
      .first<SubdomainRecord>();
  }

  let verified = false;
  let failure = 'Wildcard DNS, TLS, or the subdomain router is not ready';
  try {
    const response = await fetch(`https://${record!.hostname}/.well-known/lixrl-domain-challenge`, {
      headers: { 'X-LixRL-Verification-Token': record!.verification_token },
      redirect: 'manual',
    });
    const result = await response.json().catch(() => null) as { verified?: boolean } | null;
    verified = response.ok && result?.verified === true;
    if (!verified && result && 'error' in result) failure = 'Subdomain router rejected verification';
  } catch {
    verified = false;
  }

  if (!verified) {
    const failed = await db
      .prepare("UPDATE subdomains SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
      .bind(failure, id)
      .first<SubdomainRecord>();
    return NextResponse.json({ error: failure, subdomain: publicSubdomain(failed!) }, { status: 409 });
  }

  const hasDefault = await db
    .prepare("SELECT id FROM subdomains WHERE user_id = ? AND is_default = 1 AND status = 'active' LIMIT 1")
    .bind(user.id)
    .first();
  const active = await db
    .prepare(
      `UPDATE subdomains
       SET status = 'active', verified_at = datetime('now'), activated_at = datetime('now'),
           is_default = ?, last_error = NULL, revision = revision + 1,
           updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .bind(hasDefault ? 0 : 1, id)
    .first<SubdomainRecord>();
  auditLog(user.id, 'subdomain.activate', 'subdomain', String(id), active!.hostname).catch(() => {});
  return NextResponse.json({ subdomain: publicSubdomain(active!) });
}
