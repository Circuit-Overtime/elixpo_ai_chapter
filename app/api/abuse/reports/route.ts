import { type NextRequest, NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB, getEnv } from '@/lib/db';
import { deriveGuestRiskIdentity } from '@/lib/guest-risk';
import { rateLimit } from '@/lib/ratelimit';
import { validateLength, validateSlug } from '@/lib/validate';

export const runtime = 'edge';

const REASONS = new Set(['phishing', 'malware', 'spam', 'impersonation', 'other']);

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const limited = await rateLimit(request, 'abuse:report', 5, 60 * 60);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (validateSlug(code)) return NextResponse.json({ error: 'Enter a valid Lixrl short code' }, { status: 400 });
  if (!REASONS.has(reason)) return NextResponse.json({ error: 'Choose a valid report reason' }, { status: 400 });
  const detailsError = validateLength(details, 'Details', 10, 1000);
  if (detailsError) return NextResponse.json({ error: detailsError }, { status: 400 });
  if (email && (!email.includes('@') || email.length > 254)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const db = getDB();
  const link = await db.prepare(
    `SELECT short_code FROM urls WHERE short_code = ?
     UNION ALL SELECT short_code FROM guest_links WHERE short_code = ? LIMIT 1`,
  ).bind(code, code).first();
  if (!link) return NextResponse.json({ error: 'That short link was not found' }, { status: 404 });

  const secret = getEnv().GUEST_FINGERPRINT_SECRET;
  const reporterHash = secret
    ? (await deriveGuestRiskIdentity(request, secret)).fingerprintHash
    : null;
  await db.prepare(
    `INSERT INTO abuse_reports
       (short_code, reason, details, reporter_email, reporter_hash)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(code, reason, details, email || null, reporterHash).run();

  return NextResponse.json({ success: true }, { status: 201 });
}
