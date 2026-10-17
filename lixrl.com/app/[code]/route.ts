import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextRequest, NextResponse } from 'next/server';
import { getDB, getEnv, getKV } from '@/lib/db';
import { parseUserAgent, hashIp, hmacSha256Hex, isLikelyBot } from '@/lib/utils';
import {
  type CachedRedirect,
  isCachedRedirectExpired,
  putRedirectCache,
} from '@/lib/redirect-cache';

export const runtime = 'edge';

const SKIP_PATHS = new Set(['favicon.ico', 'robots.txt', 'sitemap.xml', '_next']);

// Sentinel value stored in KV when we've negatively cached a missing code.
// Saves D1 reads when scanners hammer random slugs.
const NEG_CACHE_VALUE = '__missing__';
const NEG_CACHE_TTL = 60; // seconds — short enough that a real create wipes it

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  if (SKIP_PATHS.has(code)) {
    return notFoundPage(request);
  }

  const kv = getKV();

  // FAST PATH: KV cache — no DB hit at all
  const cached = await kv.get(`url:${code}`);
  if (cached) {
    // Negative cache hit — code is known-bad. Short-circuit to 404
    // without touching D1.
    if (cached === NEG_CACHE_VALUE) {
      return notFoundPage(request);
    }
    try {
      const entry = JSON.parse(cached) as CachedRedirect;
      if (!entry.url || isCachedRedirectExpired(entry)) {
        kv.delete(`url:${code}`).catch(() => {});
        return notFoundPage(request);
      }
      if (!entry.guest && typeof entry.id === 'number') {
        const db = getDB();
        scheduleTracking(db, entry.id, request);
      }
      return redirect(entry.url);
    } catch {
      // Corrupted cache entry — fall through to D1 lookup and re-cache.
      kv.delete(`url:${code}`).catch(() => {});
    }
  }

  // SLOW PATH: D1 lookup
  const db = getDB();
  const urlRecord = await db
    .prepare('SELECT id, original_url, is_active, expires_at FROM urls WHERE short_code = ?')
    .bind(code)
    .first<{ id: number; original_url: string; is_active: number; expires_at: string | null }>();

  if (!urlRecord || !urlRecord.is_active) {
    const guestRecord = await db
      .prepare(
        `SELECT original_url, expires_at
         FROM guest_links
         WHERE short_code = ? AND expires_at > ?`,
      )
      .bind(code, new Date().toISOString())
      .first<{ original_url: string; expires_at: string }>();

    if (guestRecord) {
      putRedirectCache(kv, code, {
        url: guestRecord.original_url,
        guest: true,
        expires_at: guestRecord.expires_at,
      }).catch(() => {});
      return redirect(guestRecord.original_url);
    }

    // Negative cache the miss so scanners don't keep burning D1 reads.
    // Real creates populate the KV entry directly (see api/urls POST),
    // which overwrites this sentinel.
    kv.put(`url:${code}`, NEG_CACHE_VALUE, {
      expirationTtl: NEG_CACHE_TTL,
    }).catch(() => {});
    return notFoundPage(request);
  }

  if (urlRecord.expires_at && new Date(urlRecord.expires_at) < new Date()) {
    kv.delete(`url:${code}`).catch(() => {});
    return notFoundPage(request);
  }

  putRedirectCache(kv, code, {
    url: urlRecord.original_url,
    id: urlRecord.id,
    expires_at: urlRecord.expires_at,
  }).catch(() => {});

  scheduleTracking(db, urlRecord.id, request);
  return redirect(urlRecord.original_url);
}

/** Redirect to the 404 page */
function notFoundPage(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/not-found', request.url), 302);
}

/** Build a 302 redirect with cache-friendly headers */
function redirect(url: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'private, no-cache, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/** Fire-and-forget click tracking — never blocks the redirect */
function scheduleTracking(db: D1Database, urlId: number, request: NextRequest): void {
  try {
    const ctx = (globalThis as any).__nextOnPagesReqCtx?.ctx as ExecutionContext | undefined;
    const promise = trackClick(db, urlId, request);
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
    } else {
      promise.catch(() => {});
    }
  } catch {
    // Silently ignore — never block redirects for analytics
  }
}

async function trackClick(
  db: D1Database,
  urlId: number,
  request: NextRequest,
): Promise<void> {
  const userAgent = request.headers.get('user-agent');
  const ua = parseUserAgent(userAgent);
  const isBot = isLikelyBot(userAgent);

  // CF properties come through three different shapes depending on
  // runtime + framework version. Try each in order:
  //
  //   1. `getRequestContext().cf`  — the canonical next-on-pages path
  //   2. `request.cf`              — raw Workers Request property
  //   3. CF-* request headers      — set by Cloudflare's edge on the way in
  //
  // First non-empty value wins per field. In local `next dev` none of
  // these are populated, so we fall back to UA-derived "unknown" markers
  // rather than NULLs so the analytics columns aren't permanently blank
  // while developing.
  let cf: Record<string, unknown> = {};
  try {
    const ctxCf = (getRequestContext() as any).cf;
    if (ctxCf && typeof ctxCf === 'object') cf = ctxCf;
  } catch {
    // getRequestContext throws outside request scope — ignore
  }
  if (!cf.country && (request as any).cf) cf = (request as any).cf;

  const headers = request.headers;
  const country =
    (cf.country as string | undefined) ||
    headers.get('cf-ipcountry') ||
    null;
  const city =
    (cf.city as string | undefined) ||
    headers.get('cf-ipcity') ||
    null;
  const region =
    (cf.region as string | undefined) ||
    (cf.regionCode as string | undefined) ||
    headers.get('cf-region') ||
    null;

  // Real client IP: cf-connecting-ip on Cloudflare, x-forwarded-for
  // everywhere else (proxies, local dev). Last fallback: x-real-ip.
  const rawIp =
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    null;

  // Referer — usually present, but browsers strip it on:
  //   - direct address-bar navigation
  //   - cross-origin requests with Referrer-Policy: no-referrer
  // We normalize to the origin only (drops query strings + paths) so
  // downstream aggregation sees `https://twitter.com` not noisy URLs.
  const rawReferer = headers.get('referer');
  let refererOrigin: string | null = null;
  if (rawReferer) {
    try {
      refererOrigin = new URL(rawReferer).origin;
    } catch {
      refererOrigin = rawReferer.slice(0, 200);
    }
  }

  const privacySecret = getEnv().GUEST_FINGERPRINT_SECRET;
  const networkHash = await hashIp(rawIp, privacySecret);
  const visitorDay = new Date().toISOString().slice(0, 10);
  const visitorHash = rawIp && privacySecret
    ? await hmacSha256Hex(
        `visitor-day-v1|${visitorDay}|${rawIp}|${userAgent || ''}`,
        privacySecret,
      )
    : null;
  await db.batch([
    db.prepare('UPDATE urls SET clicks = clicks + ? WHERE id = ?').bind(isBot ? 0 : 1, urlId),
    db
      .prepare(
        `INSERT INTO clicks
          (url_id, country, city, region, device, browser, os, referer, ip_hash, visitor_hash, is_bot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        urlId,
        country,
        city,
        region,
        ua.device,
        ua.browser,
        ua.os,
        refererOrigin,
        networkHash,
        visitorHash,
        isBot ? 1 : 0,
      ),
  ]);
}
