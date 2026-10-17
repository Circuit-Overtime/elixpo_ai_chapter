import { deleteFromCloudinary } from './cloudinary.js';
import { getMediaCloudinaryConfig, PLATFORM_CLOUDINARY } from './cloudinaryConnections.js';

export async function deleteTrackedMedia(db, media) {
  const config = await getMediaCloudinaryConfig(db, media);
  return deleteFromCloudinary(media.cloudinary_public_id, { config });
}

export async function deleteTrackedMediaBatch(db, rows = []) {
  return Promise.allSettled(
    rows.filter((row) => row?.cloudinary_public_id).map((row) => deleteTrackedMedia(db, row)),
  );
}

export async function recalculatePlatformStorage(db, userIds = []) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    await db.prepare(`UPDATE users SET storage_used_bytes = (
      SELECT COALESCE(SUM(size_bytes), 0) FROM media_uploads
      WHERE user_id = ? AND storage_provider = ?
    ) WHERE id = ?`).bind(userId, PLATFORM_CLOUDINARY, userId).run();
  }
}
