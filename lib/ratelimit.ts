import { NextRequest, NextResponse } from 'next/server';
import { getKV } from './db';

/**
 * KV-based sliding window rate limiter.
 * Returns null if allowed, or a 429 response if rate limited.
 */
export async function rateLimit(
  request: NextRequest,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const kv = getKV();
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `rl:${key}:${ip}`;

  const current = parseInt((await kv.get(rateLimitKey)) || '0');

  if (current >= maxRequests) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(windowSeconds),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Increment counter (fire-and-forget)
  kv.put(rateLimitKey, String(current + 1), { expirationTtl: windowSeconds }).catch(() => {});

  return null; // Allowed
}

/** Rate-limit an authenticated subject without coupling the quota to its IP. */
export async function rateLimitSubject(
  key: string,
  subject: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  if (maxRequests === -1) return null;

  const kv = getKV();
  const rateLimitKey = `rl:${key}:${subject}`;
  const current = parseInt((await kv.get(rateLimitKey)) || '0', 10);

  if (current >= maxRequests) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(windowSeconds),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  kv.put(rateLimitKey, String(current + 1), { expirationTtl: windowSeconds }).catch(() => {});
  return null;
}
