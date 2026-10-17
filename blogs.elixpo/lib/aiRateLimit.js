// Shared auth + rate-limit enforcement for AI endpoints

import { getSession } from './auth';
import { getLimits } from './tiers';
import { claimAIQuota } from './aiQuota';

/**
 * Validate session and enforce AI usage limits.
 * Returns { session, error } — if error is set, return it as the Response.
 */
export async function enforceAILimits({ requireMember = false, request = null } = {}) {
  let session = await getSession();
  if (!session?.userId && request?.headers?.get('authorization')?.startsWith('Bearer ')) {
    try {
      const { requireBearerAuth } = await import('./api/v1/bearerAuth');
      const { getDB } = await import('./cloudflare');
      const auth = await requireBearerAuth(request, ['lixblogs:media:write'], { db: getDB() });
      session = { ...auth, apiClientId: auth.clientId };
    } catch {}
  }
  if (!session?.userId) {
    return {
      session: null,
      error: new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }),
    };
  }

  try {
    const { getDB } = await import('./cloudflare');
    const db = getDB();
    const user = await db.prepare('SELECT tier FROM users WHERE id = ?')
      .bind(session.userId).first();

    if (!user) {
      return {
        session,
        error: new Response(JSON.stringify({ error: 'User account not found' }), { status: 403 }),
      };
    }

    if (requireMember && user.tier !== 'member') {
      return {
        session,
        error: new Response(JSON.stringify({
          error: 'AI image generation requires the Member plan',
          upgrade: true,
        }), { status: 403 }),
      };
    }

    const limits = getLimits(user.tier);

    // Check-and-increment in a single atomic statement. A read-then-write here
    // lets parallel requests all observe the same count and exceed the cap.
    const claimed = await claimAIQuota(db, session.userId, limits.aiRequestsPerDay);
    if (!claimed) {
      return {
        session,
        error: new Response(JSON.stringify({
          error: 'Daily AI limit reached',
          limit: limits.aiRequestsPerDay,
          tier: user.tier,
        }), { status: 429 }),
      };
    }
  } catch (error) {
    if (requireMember) {
      console.error('[ai/rate-limit] membership check failed:', error);
      return {
        session,
        error: new Response(JSON.stringify({ error: 'AI access check unavailable' }), { status: 503 }),
      };
    }
    // D1 may not be available in local development for existing non-member AI routes.
  }

  return { session, error: null };
}
