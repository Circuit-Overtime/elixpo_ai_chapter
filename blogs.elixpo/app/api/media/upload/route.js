export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getLimits } from '../../../../lib/tiers';
import { MAX_MEDIA_PER_BLOG, MAX_BLOG_IMAGE_BYTES, requestTooLarge } from '../../../../lib/limits';
import { getCloudinaryUrl, uploadToCloudinary } from '../../../../lib/cloudinary';
import {
  PLATFORM_CLOUDINARY,
  getMediaCloudinaryConfig,
  getStorageTarget,
} from '../../../../lib/cloudinaryConnections';
import { stripImageMetadata } from '../../../../lib/stripImageMetadata';
import { readUploadRequest } from '../../../../lib/mediaUploadRequest';
import { isAllowedMime, ALLOWED_IMAGE_MIME_TYPES } from '../../../../src/utils/allowedImageTypes';

// Profile image types — these get overwritten (no history), no storage tracking
const PROFILE_TYPES = ['avatar', 'banner', 'org_avatar', 'org_banner'];

function uploadTransformation(mediaType) {
  if (mediaType === 'avatar' || mediaType === 'org_avatar') return 'c_fill,g_face,w_512,h_512,q_auto:low,f_webp';
  if (mediaType === 'banner' || mediaType === 'org_banner' || mediaType === 'cover') return 'c_limit,w_1920,h_1080,q_auto:low,f_webp';
  return 'c_limit,w_1920,q_auto:low,f_webp';
}

async function uploadIdentity(request) {
  const session = await getSession();
  if (session?.userId) return session;
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) return null;
  try {
    const { requireBearerAuth } = await import('../../../../lib/api/v1/bearerAuth');
    const { getDB } = await import('../../../../lib/cloudflare');
    const auth = await requireBearerAuth(request, ['lixblogs:media:write'], { db: getDB() });
    return { ...auth, apiClientId: auth.clientId };
  } catch { return null; }
}

// A browser can lose the response while Cloudinary and D1 continue processing
// the request. The persisted client queue polls this endpoint with the same job
// id before declaring an ambiguous network failure.
export async function GET(request) {
  const session = await uploadIdentity(request);
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const uploadId = new URL(request.url).searchParams.get('uploadId') || '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(uploadId)) {
    return NextResponse.json({ error: 'Invalid upload identifier' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const row = await getDB().prepare(`
      SELECT id, cloudinary_public_id, size_bytes, storage_provider,
        storage_cloud_name, secure_url
      FROM media_uploads WHERE id = ? AND user_id = ? LIMIT 1
    `).bind(uploadId, session.userId).first();
    if (!row?.secure_url) {
      return NextResponse.json({ status: 'processing' }, { status: 202 });
    }
    return NextResponse.json({
      id: row.id,
      publicId: row.cloudinary_public_id,
      url: row.secure_url,
      sizeBytes: row.size_bytes,
      storageProvider: row.storage_provider,
      storageCloudName: row.storage_cloud_name,
      idempotent: true,
    });
  } catch (error) {
    console.warn('[media/upload] Upload status lookup failed:', error?.message || error);
    return NextResponse.json({ status: 'processing' }, { status: 202 });
  }
}

export async function POST(request) {
  try {
    const session = await uploadIdentity(request);
    if (!session?.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (requestTooLarge(request)) {
      return NextResponse.json({ error: 'Image is too large', code: 'MEDIA_BODY_TOO_LARGE' }, { status: 413 });
    }

    let upload;
    try {
      upload = await readUploadRequest(request);
    } catch (error) {
      console.warn('[media/upload] Could not parse upload request', error?.message || error);
      return NextResponse.json({
        error: 'The uploaded image body could not be read. Please select the image again.',
        code: 'INVALID_MEDIA_BODY',
      }, { status: 400 });
    }
    const { file, blogId, orgId, mediaType, requestedUploadId, fields, transport } = upload;

    // Cloudflare's multipart parser can return a File-compatible object from a
    // different realm, where `instanceof File` is false. Validate capabilities
    // instead of constructor identity so valid uploads are not rejected as 400.
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number' || file.size <= 0) {
      console.warn('[media/upload] Invalid multipart file field', {
        present: !!file,
        valueType: typeof file,
        hasArrayBuffer: typeof file?.arrayBuffer === 'function',
        sizeType: typeof file?.size,
        fields,
        transport,
      });
      return NextResponse.json({
        error: 'The uploaded image body was invalid. Please select the image again.',
        code: 'INVALID_MEDIA_BODY',
      }, { status: 400 });
    }
    if (mediaType === 'cover' && !blogId) {
      return NextResponse.json({
        error: 'The cover upload is missing its blog identifier. Reload the editor and try again.',
        code: 'MISSING_BLOG_ID',
      }, { status: 400 });
    }

    // Static-image allowlist enforcement. Anything outside the canonical
    // mime list is rejected here regardless of caller — animated GIFs,
    // HEIC, PDFs, video, audio, etc. cannot reach Cloudinary.
    if (!isAllowedMime(file.type)) {
      return NextResponse.json({
        error: 'Unsupported file type',
        allowed: ALLOWED_IMAGE_MIME_TYPES,
        received: file.type || 'unknown',
      }, { status: 415 });
    }

    console.log(`[media/upload] transport=${transport} type=${mediaType} size=${file.size} mime=${file.type} blogId=${blogId} user=${session.userId}`);

    let db;
    try {
      const { getDB } = await import('../../../../lib/cloudflare');
      db = getDB();
    } catch (e) {
      console.warn('[media/upload] D1 not available, skipping DB checks:', e.message);
    }

    const isProfileImage = PROFILE_TYPES.includes(mediaType);
    const uploadId = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedUploadId) ? requestedUploadId : '';
    let trackedBlogId = null;
    let storageTarget = { provider: PLATFORM_CLOUDINARY, cloudName: null, config: null };

    if (session.credentialType === 'pat' && isProfileImage) {
      const isOrgImage = mediaType === 'org_avatar' || mediaType === 'org_banner';
      const allowed = session.resourceType === 'organization'
        ? isOrgImage && orgId === session.organizationId
        : !isOrgImage;
      if (!allowed) {
        return NextResponse.json({ error: 'This token cannot update media for that account or organization' }, { status: 403 });
      }
    }

    // A new editor URL has a blog id before its draft row exists. In that case,
    // stage the media with a NULL blog_id and attach it when the draft is saved.
    // Existing blogs still require edit permission before their media path can
    // be overwritten.
    if (db && !isProfileImage && blogId) {
      const blog = await db.prepare('SELECT id, author_id, published_as FROM blogs WHERE id = ?').bind(blogId).first();
      if (blog) {
        if (session.credentialType === 'pat') {
          const { credentialAllowsPublishedAs } = await import('../../../../lib/api/v1/personalAccessTokens');
          if (!credentialAllowsPublishedAs(session, blog.published_as)) {
            return NextResponse.json({ error: 'This token cannot upload media for that blog' }, { status: 403 });
          }
        }
        const { canEditBlog } = await import('../../../../lib/permissions');
        const perm = await canEditBlog(db, blogId, session.userId);
        if (!perm.ok) {
          return NextResponse.json({ error: 'Not authorized to upload media for this blog' }, { status: 403 });
        }
        trackedBlogId = blogId;
      } else if (session.credentialType === 'pat' && session.resourceType === 'organization') {
        return NextResponse.json({ error: 'Organization tokens require an existing blog before media can be attached' }, { status: 403 });
      }
    }

    if (db && !isProfileImage) {
      try {
        storageTarget = await getStorageTarget(db, session.userId);
      } catch (error) {
        console.error('[media/upload] Could not open creator Cloudinary connection:', error?.message || error);
        return NextResponse.json({
          error: 'Your personal Cloudinary connection could not be opened. Select LixBlogs storage in Settings and retry.',
          code: 'MEDIA_STORAGE_CONNECTION_FAILED',
        }, { status: 503 });
      }
    }

    // A persisted client job always retries with the same id. Return its prior
    // result before touching storage or Cloudinary again.
    if (db && !isProfileImage && uploadId) {
      const existing = await db.prepare(
        `SELECT id, cloudinary_public_id, size_bytes, storage_cloud_name, secure_url
         FROM media_uploads WHERE id = ? AND user_id = ?`
      ).bind(uploadId, session.userId).first();
      if (existing) return NextResponse.json({
        id: existing.id,
        publicId: existing.cloudinary_public_id,
        url: existing.secure_url || getCloudinaryUrl(existing.cloudinary_public_id, '', existing.storage_cloud_name),
        sizeBytes: existing.size_bytes,
        idempotent: true,
      });
    }

    // For org uploads, verify membership
    if (db && (mediaType === 'org_avatar' || mediaType === 'org_banner')) {
      if (!orgId) {
        return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
      }
      const membership = await db.prepare(
        'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?'
      ).bind(orgId, session.userId).first();
      const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
      const isOwner = org?.owner_id === session.userId;
      const isAdmin = membership?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Not authorized to update org media' }, { status: 403 });
      }
    }

    // Storage checks only for non-profile images (blog content images)
    if (db && !isProfileImage) {
      try {
        const replacing = mediaType === 'cover' && blogId
          ? await db.prepare(`
              SELECT size_bytes, storage_provider FROM media_uploads
              WHERE cloudinary_public_id = ?
            `).bind(`lixblogs/${blogId}/cover`).first()
          : null;
        const replacedPlatformBytes = replacing?.storage_provider === PLATFORM_CLOUDINARY
          ? Number(replacing.size_bytes || 0)
          : 0;
        const user = await db.prepare('SELECT tier, storage_used_bytes FROM users WHERE id = ?')
          .bind(session.userId).first();

        if (!user) {
          console.warn('[media/upload] User not found in DB, skipping storage checks');
        } else {
          const limits = getLimits(user.tier);
          const fileBytes = file.size;

          if (storageTarget.provider === PLATFORM_CLOUDINARY
            && user.storage_used_bytes - replacedPlatformBytes + fileBytes > limits.totalStorageBytes) {
            return NextResponse.json({
              error: 'Storage limit exceeded',
              used: user.storage_used_bytes,
              limit: limits.totalStorageBytes,
              tier: user.tier,
            }, { status: 413 });
          }

          if (blogId) {
            const blogUsage = await db.prepare(
              `SELECT COALESCE(SUM(CASE WHEN storage_provider = ? THEN size_bytes ELSE 0 END), 0) AS platform_total,
                      COUNT(*) AS n
               FROM media_uploads WHERE blog_id = ?`
            ).bind(PLATFORM_CLOUDINARY, blogId).first();

            if (storageTarget.provider === PLATFORM_CLOUDINARY
              && blogUsage.platform_total - replacedPlatformBytes + fileBytes > MAX_BLOG_IMAGE_BYTES) {
              return NextResponse.json({
                error: 'Per-blog image limit exceeded (max 10 MB of images per blog)',
                used: blogUsage.platform_total,
                limit: MAX_BLOG_IMAGE_BYTES,
              }, { status: 413 });
            }

            if (!replacing && (blogUsage.n || 0) >= MAX_MEDIA_PER_BLOG) {
              return NextResponse.json({
                error: 'Image count limit reached for this blog',
                count: blogUsage.n,
                limit: MAX_MEDIA_PER_BLOG,
              }, { status: 413 });
            }
          }
        }
      } catch (e) {
        console.warn('[media/upload] Storage check failed, continuing:', e.message);
      }
    }

    // Build Cloudinary folder and public_id
    // Avatars use deterministic slug-based paths so URLs are stable and human-readable
    let folder, publicId;
    switch (mediaType) {
      case 'avatar': {
        // Deterministic: lixblogs/avatars/users/{username}
        let username = session.userId;
        if (db) {
          const u = await db.prepare('SELECT username FROM users WHERE id = ?').bind(session.userId).first();
          if (u?.username) username = u.username;
        }
        folder = 'lixblogs/avatars/users';
        publicId = username;
        break;
      }
      case 'banner':
        folder = `lixblogs/users/${session.userId}`;
        publicId = 'banner';
        break;
      case 'org_avatar': {
        // Deterministic: lixblogs/avatars/orgs/{slug}
        let orgSlug = orgId;
        if (db) {
          const o = await db.prepare('SELECT slug FROM orgs WHERE id = ?').bind(orgId).first();
          if (o?.slug) orgSlug = o.slug;
        }
        folder = 'lixblogs/avatars/orgs';
        publicId = orgSlug;
        break;
      }
      case 'org_banner':
        folder = `lixblogs/orgs/${orgId}`;
        publicId = 'banner';
        break;
      case 'cover':
        folder = `lixblogs/${blogId}`;
        publicId = 'cover';
        break;
      default:
        folder = `lixblogs/${blogId || 'unsorted'}`;
        publicId = uploadId || crypto.randomUUID();
        break;
    }

    console.log(`[media/upload] Uploading to Cloudinary: provider=${storageTarget.provider} folder=${folder} publicId=${publicId}`);

    // Scrub EXIF/GPS/XMP/IPTC before the bytes ever leave this Worker. Cloudinary
    // stores the original untouched, so this is the last point at which we control
    // them. Every upload is scrubbed, not just those on secret posts: at upload time
    // the post is typically still a draft whose secret flag can flip later, so
    // scrubbing selectively would miss exactly the photos that need it.
    const rawBuffer = await file.arrayBuffer();
    const arrayBuffer = stripImageMetadata(rawBuffer);
    if (arrayBuffer.byteLength !== rawBuffer.byteLength) {
      console.log(`[media/upload] stripped ${rawBuffer.byteLength - arrayBuffer.byteLength} bytes of image metadata`);
    }

    let result;
    try {
      result = await uploadToCloudinary(arrayBuffer, {
        folder,
        publicId,
        mimeType: file.type,
        transformation: uploadTransformation(mediaType),
        // Covers also use a deterministic public id (`.../<blogId>/cover`).
        // Without overwrite, every replacement is rejected by Cloudinary
        // because the asset already exists.
        overwrite: isProfileImage || mediaType === 'cover',
        config: storageTarget.config,
      });
      console.log(`[media/upload] Cloudinary success: ${result.secure_url} (${result.bytes} bytes)`);
    } catch (e) {
      console.error('[media/upload] Cloudinary upload failed:', e.message);
      return NextResponse.json({ error: `Cloudinary upload failed: ${e.message}` }, { status: 502 });
    }

    // Profile images: just update the DB pointer, no storage tracking
    if (isProfileImage) {
      if (db) {
        try {
          const profileUpdatedAt = Math.floor(Date.now() / 1000);
          if (mediaType === 'avatar') {
            // Display reads avatar_url, so set both (else the new avatar won't show).
            await db.prepare('UPDATE users SET avatar_r2_key = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
              .bind(result.public_id, result.secure_url, profileUpdatedAt, session.userId).run();
          } else if (mediaType === 'banner') {
            // The public id is intentionally stable. Touch updated_at as well so
            // clients can use it as a cache-busting version after a replacement.
            await db.prepare('UPDATE users SET banner_r2_key = ?, updated_at = ? WHERE id = ?')
              .bind(result.public_id, profileUpdatedAt, session.userId).run();
          } else if (mediaType === 'org_avatar') {
            // Org UI reads logo_url for display — set both so the new logo shows.
            await db.prepare('UPDATE orgs SET logo_r2_key = ?, logo_url = ?, updated_at = ? WHERE id = ?')
              .bind(result.public_id, result.secure_url, profileUpdatedAt, orgId).run();
          } else if (mediaType === 'org_banner') {
            await db.prepare('UPDATE orgs SET banner_r2_key = ?, banner_url = ?, updated_at = ? WHERE id = ?')
              .bind(result.public_id, result.secure_url, profileUpdatedAt, orgId).run();
          }
          // Bust the cached profile so the new avatar/banner shows on refresh
          // (without this, /api/auth/me serves the stale user for up to 5 min).
          if (mediaType === 'avatar' || mediaType === 'banner') {
            try {
              const { kvInvalidate } = await import('../../../../lib/cache');
              await kvInvalidate(`v1:user:${session.userId}`);
            } catch {}
          }
        } catch (e) {
          console.warn('[media/upload] DB profile update failed:', e.message);
        }
      }

      return NextResponse.json({
        publicId: result.public_id,
        url: result.secure_url,
      });
    }

    // Blog content images: track in media_uploads + update storage
    if (db) {
      try {
        const fileBytes = Number(result.bytes) || file.size;
        const mediaId = uploadId || crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const previous = await db.prepare(
          `SELECT id, user_id, size_bytes, cloudinary_public_id, storage_provider,
                  storage_cloud_name, secure_url
           FROM media_uploads WHERE cloudinary_public_id = ?`
        ).bind(result.public_id).first();

        await db.prepare(`
          INSERT INTO media_uploads
            (id, user_id, blog_id, cloudinary_public_id, size_bytes, media_type, created_at,
             storage_provider, storage_cloud_name, secure_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cloudinary_public_id) DO UPDATE SET
            id = excluded.id,
            user_id = excluded.user_id,
            blog_id = COALESCE(excluded.blog_id, media_uploads.blog_id),
            size_bytes = excluded.size_bytes,
            media_type = excluded.media_type,
            created_at = excluded.created_at,
            storage_provider = excluded.storage_provider,
            storage_cloud_name = excluded.storage_cloud_name,
            secure_url = excluded.secure_url
        `).bind(
          mediaId, session.userId, trackedBlogId, result.public_id, fileBytes, mediaType, now,
          storageTarget.provider, storageTarget.cloudName, result.secure_url,
        ).run();

        // Replacing a deterministic cover after switching storage providers must
        // not leave an untracked copy consuming the previous account's quota.
        if (previous && (
          previous.storage_provider !== storageTarget.provider
          || (previous.storage_cloud_name || null) !== storageTarget.cloudName
        )) {
          try {
            const { deleteFromCloudinary } = await import('../../../../lib/cloudinary');
            const previousConfig = await getMediaCloudinaryConfig(db, previous);
            await deleteFromCloudinary(previous.cloudinary_public_id, { config: previousConfig });
          } catch (error) {
            console.warn('[media/upload] Previous provider cleanup failed:', error?.message || error);
          }
        }

        const affectedStorageOwners = new Set([session.userId, previous?.user_id].filter(Boolean));
        for (const storageOwner of affectedStorageOwners) {
          await db.prepare(`UPDATE users SET storage_used_bytes = (
            SELECT COALESCE(SUM(size_bytes), 0) FROM media_uploads
            WHERE user_id = ? AND storage_provider = ?
          ) WHERE id = ?`).bind(storageOwner, PLATFORM_CLOUDINARY, storageOwner).run();
        }
        try {
          const { kvInvalidate, mediaInventoryCacheKey } = await import('../../../../lib/cache');
          await kvInvalidate(...[...affectedStorageOwners].map(mediaInventoryCacheKey));
        } catch {}

        return NextResponse.json({
          id: mediaId,
          publicId: result.public_id,
          url: result.secure_url,
          sizeBytes: fileBytes,
          storageProvider: storageTarget.provider,
          storageCloudName: storageTarget.cloudName,
        });
      } catch (e) {
        console.warn('[media/upload] DB tracking failed, returning URL anyway:', e.message);
      }
    }

    // Fallback: return Cloudinary URL even if DB tracking failed
    return NextResponse.json({
      publicId: result.public_id,
      url: result.secure_url,
    });
  } catch (e) {
    console.error('[media/upload] Unhandled error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

// Remove a profile image → clears the DB pointer so it falls back to the default
// (avatar → initials, banner → blank, org logo → pixel avatar). Body: { type, orgId }.
export async function DELETE(request) {
  const session = await uploadIdentity(request);
  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { type, orgId } = await request.json().catch(() => ({}));
  if (!PROFILE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  try {
    const { getDB } = await import('../../../../lib/cloudflare');
    const db = getDB();

    if (session.credentialType === 'pat') {
      const isOrgImage = type === 'org_avatar' || type === 'org_banner';
      const allowed = session.resourceType === 'organization'
        ? isOrgImage && orgId === session.organizationId
        : !isOrgImage;
      if (!allowed) return NextResponse.json({ error: 'This token cannot update media for that account or organization' }, { status: 403 });
    }

    if (type === 'org_avatar' || type === 'org_banner') {
      if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
      // Only org admins/maintainers (or the owner) may clear org media.
      const membership = await db.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
        .bind(orgId, session.userId).first();
      const org = await db.prepare('SELECT owner_id FROM orgs WHERE id = ?').bind(orgId).first();
      if (org?.owner_id !== session.userId && membership?.role !== 'admin' && membership?.role !== 'maintain') {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      const profileUpdatedAt = Math.floor(Date.now() / 1000);
      if (type === 'org_avatar') {
        await db.prepare('UPDATE orgs SET logo_r2_key = NULL, logo_url = NULL, updated_at = ? WHERE id = ?')
          .bind(profileUpdatedAt, orgId).run();
      } else {
        await db.prepare('UPDATE orgs SET banner_r2_key = NULL, banner_url = NULL, updated_at = ? WHERE id = ?')
          .bind(profileUpdatedAt, orgId).run();
      }
    } else if (type === 'avatar') {
      await db.prepare('UPDATE users SET avatar_r2_key = NULL, avatar_url = NULL, updated_at = ? WHERE id = ?')
        .bind(Math.floor(Date.now() / 1000), session.userId).run();
      try { const { kvInvalidate } = await import('../../../../lib/cache'); await kvInvalidate(`v1:user:${session.userId}`); } catch {}
    } else if (type === 'banner') {
      await db.prepare('UPDATE users SET banner_r2_key = NULL, updated_at = ? WHERE id = ?')
        .bind(Math.floor(Date.now() / 1000), session.userId).run();
      try { const { kvInvalidate } = await import('../../../../lib/cache'); await kvInvalidate(`v1:user:${session.userId}`); } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[media/upload] DELETE failed:', e);
    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}
