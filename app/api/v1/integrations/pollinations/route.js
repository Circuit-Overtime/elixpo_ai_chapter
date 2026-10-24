export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import { pollinationsEnabled, publicConnection, refreshPollinationsConnection } from '../../../../../lib/pollinations';

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:media:read'], 'integrations.pollinations.read');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  if (!pollinationsEnabled()) return apiSuccess(context, { enabled: false, comingSoon: true, ...publicConnection(null) }, { headers: rateHeaders });
  try {
    let row = await db.prepare('SELECT * FROM pollinations_connections WHERE user_id=?').bind(auth.userId).first();
    row = await refreshPollinationsConnection(db, row, { force: new URL(request.url).searchParams.get('refresh') === '1' });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'integrations.pollinations.read', resourceType: 'integration', resourceId: 'pollinations' });
    return apiSuccess(context, { enabled: true, comingSoon: false, connectUrl: 'https://blogs.elixpo.com/settings?tab=integrations', ...publicConnection(row) }, { headers: rateHeaders });
  } catch (error) { return apiError(context, 'integration_unavailable', 'Pollinations status is unavailable.', 503, { headers: rateHeaders }); }
}

export async function DELETE(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:media:write'], 'integrations.pollinations.disconnect');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  await db.prepare('DELETE FROM pollinations_connections WHERE user_id=?').bind(auth.userId).run();
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'integrations.pollinations.disconnect', resourceType: 'integration', resourceId: 'pollinations' });
  return apiSuccess(context, { disconnected: true }, { headers: rateHeaders });
}
