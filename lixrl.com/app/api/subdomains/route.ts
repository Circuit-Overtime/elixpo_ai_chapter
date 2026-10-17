import { NextRequest, NextResponse } from 'next/server';
import { auditLog, resolveUser } from '@/lib/auth';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { publicSubdomain } from '@/lib/subdomain-control';
import {
  generateVerificationToken,
  normalizeSubdomainLabel,
  subdomainEntitlement,
  subdomainHostname,
  validateSubdomainLabel,
  verificationExpiry,
} from '@/lib/subdomains';
import type { SubdomainRecord } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { results } = await getDB()
    .prepare(
      `SELECT * FROM subdomains
       WHERE user_id = ? AND status != 'removed'
       ORDER BY is_default DESC, created_at ASC`,
    )
    .bind(user.id)
    .all<SubdomainRecord>();

  return NextResponse.json({
    subdomains: (results || []).map(publicSubdomain),
    entitlement: subdomainEntitlement(user.tier),
  });
}

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const limited = await rateLimit(request, 'subdomain:create', 5, 60);
  if (limited) return limited;

  const user = await resolveUser(request, 'write');
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowance = subdomainEntitlement(user.tier);
  if (allowance === 0) {
    return NextResponse.json({ error: 'Subdomains require Pro or above' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { label?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const labelError = validateSubdomainLabel(body.label);
  if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });

  const db = getDB();
  if (allowance !== -1) {
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM subdomains WHERE user_id = ? AND status != 'removed'")
      .bind(user.id)
      .first<{ count: number }>();
    if ((count?.count || 0) >= allowance) {
      return NextResponse.json({ error: `Your ${user.tier} plan includes ${allowance} subdomain${allowance === 1 ? '' : 's'}` }, { status: 403 });
    }
  }

  const label = normalizeSubdomainLabel(body.label);
  const hostname = subdomainHostname(label);
  try {
    const record = await db
      .prepare(
        `INSERT INTO subdomains
          (user_id, label, hostname, verification_token, verification_expires_at)
         VALUES (?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(user.id, label, hostname, generateVerificationToken(), verificationExpiry())
      .first<SubdomainRecord>();
    auditLog(user.id, 'subdomain.claim', 'subdomain', String(record!.id), hostname).catch(() => {});
    return NextResponse.json({ subdomain: publicSubdomain(record!) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'This subdomain is already claimed' }, { status: 409 });
  }
}
