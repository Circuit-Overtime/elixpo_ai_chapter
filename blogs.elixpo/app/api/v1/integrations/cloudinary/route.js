export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import {
  USER_CLOUDINARY,
} from '../../../../../lib/cloudinaryConnections';
import { decryptIntegrationSecret } from '../../../../../lib/integrationSecrets';
import { revokeCloudinaryToken } from '../../../../../lib/cloudinaryOAuth';

const READ_SCOPE = 'lixblogs:integrations:cloudinary:read';
const DISCONNECT_SCOPE = 'lixblogs:integrations:cloudinary:disconnect';

async function connectionStatus(db, userId) {
  const connection = await db.prepare(`
    SELECT cloud_name, enabled, created_at, updated_at, auth_method
    FROM cloudinary_connections WHERE user_id = ?
  `).bind(userId).first();
  const usage = await db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
    FROM media_uploads WHERE user_id = ? AND storage_provider = ?
  `).bind(userId, USER_CLOUDINARY).first();
  return {
    connected: !!connection,
    useForUploads: !!connection?.enabled,
    cloudName: connection?.cloud_name || null,
    authMethod: connection?.auth_method || null,
    mediaCount: Number(usage?.count || 0),
    trackedBytes: Number(usage?.bytes || 0),
    connectedAt: connection?.created_at || null,
    updatedAt: connection?.updated_at || null,
  };
}

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [READ_SCOPE], 'integrations.cloudinary.read');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const data = await connectionStatus(db, auth.userId);
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'integrations.cloudinary.read', resourceType: 'integration',
    });
    return apiSuccess(context, data, { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/integrations/cloudinary] status failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Cloudinary connection status could not be read.', 500, { headers: rateHeaders });
  }
}

export async function DELETE(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [DISCONNECT_SCOPE], 'integrations.cloudinary.disconnect');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  try {
    const used = await db.prepare(`
      SELECT COUNT(*) AS count FROM media_uploads
      WHERE user_id = ? AND storage_provider = ?
    `).bind(auth.userId, USER_CLOUDINARY).first();
    if (Number(used?.count || 0) > 0) {
      return apiError(context, 'media_still_stored',
        'This connection still owns blog media. Delete those assets from the Media tab before removing it.',
        409, { headers: rateHeaders });
    }

    const connection = await db.prepare(`
      SELECT auth_method, refresh_token_encrypted
      FROM cloudinary_connections WHERE user_id = ?
    `).bind(auth.userId).first();

    if (connection?.auth_method === 'oauth' && connection.refresh_token_encrypted) {
      try {
        const refreshToken = await decryptIntegrationSecret(connection.refresh_token_encrypted);
        await revokeCloudinaryToken(refreshToken);
      } catch (error) {
        console.warn('[api/v1/integrations/cloudinary] Revocation failed:', error?.message || error);
      }
    }

    await db.prepare('DELETE FROM cloudinary_connections WHERE user_id = ?').bind(auth.userId).run();

    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'integrations.cloudinary.disconnect', resourceType: 'integration',
    });

    return apiSuccess(context, await connectionStatus(db, auth.userId), { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/integrations/cloudinary] disconnect failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The Cloudinary connection could not be disconnected.', 500, { headers: rateHeaders });
  }
}
