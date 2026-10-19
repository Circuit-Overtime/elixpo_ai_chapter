export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import { deleteFromCloudinary } from '../../../../../lib/cloudinary';
import { PLATFORM_CLOUDINARY, getMediaCloudinaryConfig } from '../../../../../lib/cloudinaryConnections';
import { kvInvalidate, mediaInventoryCacheKey } from '../../../../../lib/cache';

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:media:write'], 'media.delete');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const media = await db.prepare(`SELECT id,user_id,blog_id,media_type,cloudinary_public_id,
    storage_provider,storage_cloud_name,secure_url FROM media_uploads WHERE id=? AND user_id=?`)
    .bind(id, auth.userId).first();
  if (!media) return apiError(context, 'media_not_found', 'The media asset was not found.', 404, { headers: rateHeaders });
  try {
    const config = await getMediaCloudinaryConfig(db, media);
    await deleteFromCloudinary(media.cloudinary_public_id, { config });
  } catch {
    const personal = media.storage_provider !== PLATFORM_CLOUDINARY;
    return apiError(context, 'media_delete_failed', personal
      ? 'Reconnect the Cloudinary space that owns this asset before deleting it.'
      : 'Cloudinary could not delete this asset. Try again shortly.', personal ? 409 : 502, { headers: rateHeaders });
  }
  await db.batch([
    db.prepare('DELETE FROM media_uploads WHERE id=?').bind(id),
    db.prepare(`UPDATE users SET storage_used_bytes=(SELECT COALESCE(SUM(size_bytes),0)
      FROM media_uploads WHERE user_id=? AND storage_provider=?) WHERE id=?`)
      .bind(auth.userId, PLATFORM_CLOUDINARY, auth.userId),
  ]);
  if (media.media_type === 'cover' && media.blog_id) {
    await db.prepare('UPDATE blogs SET cover_image_r2_key=NULL,updated_at=unixepoch() WHERE id=?').bind(media.blog_id).run();
  }
  await kvInvalidate(mediaInventoryCacheKey(auth.userId));
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'media.delete', resourceType: 'media', resourceId: id });
  return apiSuccess(context, { id, deleted: true }, { headers: rateHeaders });
}
