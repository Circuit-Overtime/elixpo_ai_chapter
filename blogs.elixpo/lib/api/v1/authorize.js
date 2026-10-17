import { getDB } from '../../cloudflare';
import { requireBearerAuth } from './bearerAuth';
import { apiError, authErrorResponse } from './responses';
import { consumeApiRateLimit } from './operations';
import { enforcePersonalAccessTokenRoute } from './personalAccessTokens';

export async function authorizeApiRequest(request, context, requiredScopes, route) {
  try {
    const db = getDB();
    const auth = await requireBearerAuth(request, requiredScopes, { db });
    await enforcePersonalAccessTokenRoute(db, auth, request);
    const user = await db.prepare('SELECT 1 FROM users WHERE id = ?').bind(auth.userId).first();
    if (!user) {
      return {
        response: apiError(
          context,
          'account_not_provisioned',
          'This Accounts profile is not available in LixBlogs yet.',
          403,
        ),
      };
    }
    const rateLimit = await consumeApiRateLimit(
      db,
      auth.credentialType === 'pat' ? `pat:${auth.credentialId}` : auth.userId,
      route,
    );
    if (!rateLimit.allowed) {
      return {
        response: apiError(
          context,
          'rate_limit_exceeded',
          'Too many API requests. Retry after the current window.',
          429,
          { headers: rateLimit.headers },
        ),
      };
    }
    if (auth.credentialType === 'pat') {
      const accountLimit = await consumeApiRateLimit(db, `account:${auth.userId}`, route, 600);
      if (!accountLimit.allowed) {
        return {
          response: apiError(
            context,
            'rate_limit_exceeded',
            'This account has made too many API requests. Retry after the current window.',
            429,
            { headers: accountLimit.headers },
          ),
        };
      }
    }
    return { auth, db, rateHeaders: rateLimit.headers };
  } catch (error) {
    if (error?.name === 'ApiAuthError') return { response: authErrorResponse(context, error) };
    console.error('[api/v1/auth] authorization failed:', error?.message || error);
    return {
      response: apiError(context, 'internal_error', 'The API could not authorize this request.', 500),
    };
  }
}
