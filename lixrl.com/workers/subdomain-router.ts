import { subdomainRedirectCacheKey, validateSubdomainLabel } from '../lib/subdomains';
import { hashIp, hmacSha256Hex, isLikelyBot, parseUserAgent } from '../lib/utils';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  GUEST_FINGERPRINT_SECRET?: string;
}

interface DomainState {
  id: number;
  status: string;
  revision: number;
  verification_token: string;
}

interface RedirectRecord {
  id: number;
  original_url: string;
  expires_at: string | null;
}

const NEGATIVE = '__missing__';
const NEGATIVE_TTL = 60;
const CACHE_TTL = 24 * 60 * 60;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const label = extractLabel(url.hostname);
    if (!label || validateSubdomainLabel(label)) return notFound();

    const domain = await env.DB
      .prepare(
        `SELECT s.id, s.status, s.revision, s.verification_token
         FROM subdomains s
         JOIN users u ON u.id = s.user_id
         WHERE s.label = ? AND s.status != 'removed' AND u.is_active = 1
         ORDER BY s.id DESC LIMIT 1`,
      )
      .bind(label)
      .first<DomainState>();
    if (!domain) return notFound();

    if (url.pathname === '/.well-known/lixrl-domain-challenge') {
      return verificationResponse(request, domain);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (domain.status !== 'active') return notFound();

    const entitlement = await env.DB
      .prepare(
        `SELECT 1 AS allowed
         FROM subdomains s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.status = 'active'
           AND u.tier IN ('pro', 'business', 'enterprise')
           AND (u.tier_expires_at IS NULL OR u.tier_expires_at > datetime('now'))`,
      )
      .bind(domain.id)
      .first<{ allowed: number }>();
    if (!entitlement) return notFound();

    const code = decodeURIComponent(url.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase();
    if (!code || code.includes('/')) return notFound();
    const cacheKey = subdomainRedirectCacheKey(domain.id, domain.revision, code);
    const cached = await env.KV.get(cacheKey);
    if (cached === NEGATIVE) return notFound();
    if (cached) {
      try {
        const entry = JSON.parse(cached) as RedirectRecord;
        if (entry.original_url && !isExpired(entry.expires_at)) {
          ctx.waitUntil(trackClick(env, entry.id, request));
          return redirect(entry.original_url);
        }
      } catch {
        ctx.waitUntil(env.KV.delete(cacheKey));
      }
    }

    const record = await env.DB
      .prepare(
        `SELECT u.id, u.original_url, u.expires_at
         FROM subdomain_links dl
         JOIN urls u ON u.id = dl.url_id
         WHERE dl.subdomain_id = ? AND dl.short_code = ? AND u.is_active = 1
           AND (u.expires_at IS NULL OR u.expires_at > datetime('now'))
         LIMIT 1`,
      )
      .bind(domain.id, code)
      .first<RedirectRecord>();
    if (!record) {
      ctx.waitUntil(env.KV.put(cacheKey, NEGATIVE, { expirationTtl: NEGATIVE_TTL }));
      return notFound();
    }

    const ttl = record.expires_at
      ? Math.floor((Date.parse(record.expires_at) - Date.now()) / 1000)
      : CACHE_TTL;
    if (ttl >= 60) {
      ctx.waitUntil(env.KV.put(cacheKey, JSON.stringify(record), { expirationTtl: Math.min(ttl, CACHE_TTL) }));
    }
    ctx.waitUntil(trackClick(env, record.id, request));
    return redirect(record.original_url);
  },
} satisfies ExportedHandler<Env>;

function extractLabel(hostname: string): string | null {
  const suffix = '.lixrl.com';
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized.endsWith(suffix)) return null;
  const label = normalized.slice(0, -suffix.length);
  return label && !label.includes('.') ? label : null;
}

function verificationResponse(request: Request, domain: DomainState): Response {
  const supplied = request.headers.get('x-lixrl-verification-token') || '';
  const allowedState = ['pending', 'verified', 'failed', 'suspended'].includes(domain.status);
  if (!allowedState || !constantTimeEqual(supplied, domain.verification_token)) return notFound();
  return Response.json(
    { verified: true },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function isExpired(expiresAt: string | null): boolean {
  return !!expiresAt && Date.parse(expiresAt) <= Date.now();
}

function redirect(destination: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Cache-Control': 'private, no-cache, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function notFound(): Response {
  return new Response('Short link not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}

async function trackClick(env: Env, urlId: number, request: Request): Promise<void> {
  try {
    const headers = request.headers;
    const userAgent = headers.get('user-agent');
    const ua = parseUserAgent(userAgent);
    const cf = (request as Request & { cf?: Record<string, unknown> }).cf || {};
    const rawIp = headers.get('cf-connecting-ip');
    const secret = env.GUEST_FINGERPRINT_SECRET || '';
    const ipHash = secret ? await hashIp(rawIp, secret) : null;
    const day = new Date().toISOString().slice(0, 10);
    const visitorHash = rawIp && secret
      ? await hmacSha256Hex(`visitor-day-v1|${day}|${rawIp}|${userAgent || ''}`, secret)
      : null;
    const bot = isLikelyBot(userAgent);
    let referer: string | null = null;
    const rawReferer = headers.get('referer');
    if (rawReferer) {
      try { referer = new URL(rawReferer).origin; } catch { referer = rawReferer.slice(0, 200); }
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE urls SET clicks = clicks + ? WHERE id = ?').bind(bot ? 0 : 1, urlId),
      env.DB.prepare(
        `INSERT INTO clicks
          (url_id, country, city, region, device, browser, os, referer, ip_hash, visitor_hash, is_bot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        urlId,
        (cf.country as string | undefined) || headers.get('cf-ipcountry'),
        (cf.city as string | undefined) || null,
        (cf.region as string | undefined) || null,
        ua.device,
        ua.browser,
        ua.os,
        referer,
        ipHash,
        visitorHash,
        bot ? 1 : 0,
      ),
    ]);
  } catch {
    // Analytics must never block or fail a redirect.
  }
}
