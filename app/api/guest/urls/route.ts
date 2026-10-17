import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextRequest, NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/csrf';
import { getDB, getEnv, getKV } from '@/lib/db';
import { deriveGuestRiskIdentity } from '@/lib/guest-risk';
import { rateLimit } from '@/lib/ratelimit';
import { checkSafeBrowsing, threatMessage } from '@/lib/safebrowsing';
import { putRedirectCache } from '@/lib/redirect-cache';
import { generateShortCode } from '@/lib/utils';
import { badRequest, validateSlug, validateUrl } from '@/lib/validate';

export const runtime = 'edge';

const GUEST_TTL_SECONDS = 24 * 60 * 60;
const MAX_RISK_SCORE = 59;

export async function POST(request: NextRequest) {
  const csrfErr = requireSameOrigin(request);
  if (csrfErr) return csrfErr;

  const limited = await rateLimit(request, 'guest-url:create', 5, 60);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON');
  }

  const url =
    typeof body === 'object' && body !== null && 'url' in body
      ? (body as { url?: unknown }).url
      : undefined;
  if (!url || typeof url !== 'string') return badRequest('url is required');

  const urlErr = validateUrl(url);
  if (urlErr) return badRequest(urlErr);

  const env = getEnv();
  const fingerprintSecret =
    env.GUEST_FINGERPRINT_SECRET || env.ELIXPO_WEBHOOK_SECRET;
  if (!fingerprintSecret) {
    console.error('[guest-url] GUEST_FINGERPRINT_SECRET is not configured');
    return NextResponse.json(
      { error: 'Guest shortening is temporarily unavailable' },
      { status: 503 },
    );
  }

  const threat = await checkSafeBrowsing(url, env.SAFE_BROWSING_API_KEY);
  if (threat) {
    return NextResponse.json({ error: threatMessage(threat) }, { status: 422 });
  }

  const identity = await deriveGuestRiskIdentity(request, fingerprintSecret);
  if (identity.score > MAX_RISK_SCORE) {
    return NextResponse.json(
      {
        error: 'This request could not be verified. Sign in to shorten URLs.',
        account_required: true,
      },
      { status: 403 },
    );
  }

  const db = getDB();
  let shortCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `g${generateShortCode(6)}`;
    if (validateSlug(candidate)) continue;

    const collision = await db
      .prepare(
        `SELECT short_code FROM urls WHERE short_code = ?
         UNION ALL
         SELECT short_code FROM guest_links WHERE short_code = ?
         LIMIT 1`,
      )
      .bind(candidate, candidate)
      .first();
    if (!collision) {
      shortCode = candidate;
      break;
    }
  }

  if (!shortCode) {
    return NextResponse.json(
      { error: 'Could not generate a safe slug, please retry' },
      { status: 500 },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + GUEST_TTL_SECONDS * 1000);
  const quota = await db
    .prepare(
      `INSERT INTO guest_quotas
         (fingerprint_hash, available_at, last_risk_score, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(fingerprint_hash) DO UPDATE SET
         available_at = excluded.available_at,
         last_risk_score = excluded.last_risk_score,
         updated_at = datetime('now')
       WHERE guest_quotas.available_at <= ?
       RETURNING available_at`,
    )
    .bind(
      identity.fingerprintHash,
      expiresAt.toISOString(),
      identity.score,
      now.toISOString(),
    )
    .first<{ available_at: string }>();

  if (!quota) {
    const existing = await db
      .prepare(
        'SELECT available_at FROM guest_quotas WHERE fingerprint_hash = ?',
      )
      .bind(identity.fingerprintHash)
      .first<{ available_at: string }>();
    const retryAfter = existing
      ? Math.max(
          60,
          Math.ceil(
            (new Date(existing.available_at).getTime() - Date.now()) / 1000,
          ),
        )
      : GUEST_TTL_SECONDS;

    return NextResponse.json(
      {
        error:
          'Your guest link has already been used. Sign in for persistent links.',
        account_required: true,
        available_at: existing?.available_at,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    await db
      .prepare(
        `INSERT INTO guest_links
           (short_code, original_url, fingerprint_hash, risk_score, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        shortCode,
        url,
        identity.fingerprintHash,
        identity.score,
        expiresAt.toISOString(),
      )
      .run();
  } catch (error) {
    // The quota claim and link insert cannot share a D1 transaction through
    // separate prepared calls. Release only the exact claim made above so a
    // failed insert never consumes the visitor's 24-hour allowance.
    await db.prepare(
      `UPDATE guest_quotas SET available_at = ?, updated_at = datetime('now')
       WHERE fingerprint_hash = ? AND available_at = ?`,
    ).bind(now.toISOString(), identity.fingerprintHash, expiresAt.toISOString()).run().catch(() => {});
    console.error('[guest-url] link insert failed', error);
    return NextResponse.json({ error: 'Could not create the guest link' }, { status: 500 });
  }

  putRedirectCache(getKV(), shortCode, {
    url,
    guest: true,
    expires_at: expiresAt.toISOString(),
  }).catch(() => {});

  const cleanup = db.batch([
    db.prepare('DELETE FROM guest_links WHERE expires_at <= ?').bind(now.toISOString()),
    db.prepare('DELETE FROM guest_quotas WHERE available_at <= ?').bind(now.toISOString()),
  ]).then(() => undefined).catch(() => {});
  try {
    getRequestContext().ctx.waitUntil(cleanup);
  } catch {
    // Local Next development does not always expose an execution context.
  }

  const baseUrl = env.BASE_URL || new URL(request.url).origin;
  return NextResponse.json(
    {
      short_url: `${baseUrl}/${shortCode}`,
      short_code: shortCode,
      original_url: url,
      expires_at: expiresAt.toISOString(),
      guest: true,
    },
    { status: 201 },
  );
}
