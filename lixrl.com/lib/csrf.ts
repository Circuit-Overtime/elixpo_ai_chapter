import { NextResponse } from 'next/server';

/**
 * CSRF defense — Origin/Referer header check on state-changing requests.
 *
 * Strategy:
 *
 *   1. Session cookies are SameSite=Lax — that's already CSRF-safe for the
 *      common cross-origin POST vector in modern browsers (cookies aren't
 *      sent on cross-site form submits / fetch).
 *
 *   2. This function adds defense-in-depth: for state-changing methods,
 *      we require the Origin header (or Referer as a fallback) to match
 *      the request URL's origin. Modern browsers send `Origin` on every
 *      non-GET fetch, so missing-both is treated as suspicious.
 *
 *   3. API-key authenticated requests (Authorization: Bearer …) bypass
 *      the check — bearer auth isn't exploitable from a victim's browser
 *      because attackers can't read the key out of localStorage/code from
 *      another origin.
 *
 * Call this at the top of every POST/PATCH/PUT/DELETE handler that can
 * be reached via session cookies. Returns null on pass, or a NextResponse
 * the handler should return as-is on fail.
 */
export function requireSameOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  // Safe methods don't change state — Lax cookies already protect these
  // from CSRF and we don't want to break cross-site GET embeds.
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }

  // Bearer auth (API keys) bypasses CSRF — not exploitable from a
  // victim's browser. The user explicitly placed the key in their app.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');

  if (origin) {
    // Modern browsers always send Origin on non-GET fetch — this is the
    // canonical signal.
    if (origin !== expectedOrigin) {
      return reject('Cross-origin request rejected', expectedOrigin, origin);
    }
    return null;
  }

  // Fallback: Referer header. Older browsers / privacy modes may strip
  // Origin; Referer carries the same info with more entropy.
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      if (new URL(referer).origin !== expectedOrigin) {
        return reject('Cross-origin referer', expectedOrigin, referer);
      }
      return null;
    } catch {
      return reject('Invalid referer header', expectedOrigin, referer);
    }
  }

  // Neither header present on a state-changing request. With modern
  // browsers this should not happen for legitimate same-origin fetches;
  // reject by default.
  return reject('Missing Origin/Referer on state-changing request', expectedOrigin, null);
}

function reject(
  reason: string,
  expected: string,
  got: string | null,
): NextResponse {
  // Log enough server-side to debug a misbehaving client without
  // leaking specifics to the attacker.
  console.warn(
    `[csrf] ${reason} — expected ${expected}, got ${got ?? '<none>'}`,
  );
  return NextResponse.json(
    { error: 'CSRF check failed' },
    { status: 403 },
  );
}
