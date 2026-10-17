export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import {
  countBlockWords,
  inputErrorResponse,
  isBlogOwner,
  normalizeBlogInput,
  requireMemberOnlyAllowed,
  requirePublishTarget,
  slugify,
} from '../../../../../lib/api/v1/blogInput';
import { invalidateBlogLifecycleCaches } from '../../../../../lib/api/v1/blogCache';
import { blogEntityTag } from '../../../../../lib/api/v1/entityTag';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { checkIfMatch } from '../../../../../lib/api/v1/preconditions';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import { compressBlogContent, decompressBlogContent } from '../../../../../lib/compress';
import { excerptFromBlocks } from '../../../../../lib/excerpt';
import { getBlogCanonicalPath } from '../../../../../lib/blogUrl';
import { ensureUniqueBlogSlug } from '../../../../../lib/namespace';
import { canEditBlog } from '../../../../../lib/permissions';
import { readTimeFromWords } from '../../../../../lib/readTime';
import { credentialAllowsPublishedAs } from '../../../../../lib/api/v1/personalAccessTokens';
import { contentDiscoveryMetadata } from '../../../../../lib/recommendations';
import { notifySearchDiscovery } from '../../../../../lib/searchDiscovery';

const READ_SCOPE = 'lixblogs:blog:read';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [READ_SCOPE], 'blogs.get');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  if (!id || id.length > 128) {
    return apiError(context, 'invalid_blog_id', 'The blog ID is invalid.', 400, { headers: rateHeaders });
  }

  try {
    const blog = await db.prepare(`
      SELECT b.* FROM blogs b
      WHERE b.id = ? AND (
        b.author_id = ?
        OR EXISTS (
          SELECT 1 FROM blog_co_authors c
          WHERE c.blog_id = b.id AND c.user_id = ? AND c.status = 'accepted'
        )
        OR (
          b.published_as LIKE 'org:%'
          AND EXISTS (
            SELECT 1 FROM org_members m
            WHERE m.org_id = substr(b.published_as, 5) AND m.user_id = ?
          )
        )
      )
      LIMIT 1
    `).bind(id, auth.userId, auth.userId, auth.userId).first();

    if (!blog) {
      return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    }

    const [tags, permission, etag, canonicalPath] = await Promise.all([
      db.prepare('SELECT tag FROM blog_tags WHERE blog_id = ? ORDER BY tag').bind(blog.id).all(),
      canEditBlog(db, blog.id, auth.userId),
      blogEntityTag(blog),
      getBlogCanonicalPath(db, blog.id),
    ]);
    let content = blog.content;
    try { content = decompressBlogContent(content); } catch {}

    await recordApiAudit(db, {
      requestId: context.requestId,
      userId: auth.userId,
      clientId: auth.clientId,
      action: 'blogs.get',
      resourceType: 'blog',
      resourceId: blog.id,
    });

    return apiSuccess(context, {
      id: blog.id,
      slug: blog.slug,
      title: blog.title || '',
      subtitle: blog.subtitle || '',
      content,
      tags: (tags?.results || []).map((row) => row.tag),
      status: blog.status,
      authorId: blog.author_id,
      publishedAs: blog.published_as,
      collectionId: blog.collection_id || null,
      emoji: blog.page_emoji || null,
      coverUrl: blog.cover_image_r2_key || null,
      coverPosition: { x: blog.cover_pos_x ?? 50, y: blog.cover_pos_y ?? 50 },
      coverZoom: blog.cover_zoom ?? 1,
      memberOnly: Boolean(blog.member_only),
      license: blog.license || 'all-rights-reserved',
      language: blog.language || 'und',
      region: blog.region || 'global',
      allowComments: Boolean(blog.allow_comments),
      secret: Boolean(blog.secret),
      canEdit: Boolean(permission.ok),
      createdAt: blog.created_at,
      updatedAt: blog.updated_at,
      publishedAt: blog.published_at || null,
      deletedAt: blog.deleted_at || null,
      preDeleteStatus: blog.pre_delete_status || null,
      url: `https://blogs.elixpo.com${canonicalPath}`,
      etag,
    }, { headers: { ...rateHeaders, ETag: etag } });
  } catch (error) {
    console.error('[api/v1/blogs] get failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be loaded.', 500, { headers: rateHeaders });
  }
}

export async function PATCH(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'blogs.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;

  try {
    const current = await db.prepare('SELECT * FROM blogs WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!current) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    const permission = await canEditBlog(db, id, auth.userId);
    if (!permission.ok) return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    const precondition = await checkIfMatch(request, current);
    if (!precondition.ok) {
      return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, {
        details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current },
      });
    }

    const body = await request.json();
    const input = normalizeBlogInput(body, { partial: true });
    const owner = await isBlogOwner(db, current, auth.userId);
    if (!owner && (input.slug !== undefined || input.publishedAs !== undefined || input.collectionId !== undefined)) {
      return apiError(context, 'owner_required', 'Only the blog owner can change its slug or publication.', 403, { headers: rateHeaders });
    }

    let content;
    try { content = decompressBlogContent(current.content) || []; } catch { content = []; }
    content = input.content ?? content;
    const target = owner
      ? await requirePublishTarget(db, auth.userId, input.publishedAs || current.published_as, input.collectionId ?? current.collection_id)
      : { publishedAs: current.published_as, collectionId: current.collection_id };
    if (!credentialAllowsPublishedAs(auth, target.publishedAs)) {
      return apiError(context, 'credential_scope_forbidden', 'This token cannot move the blog to that account or organization.', 403, { headers: rateHeaders });
    }
    await requireMemberOnlyAllowed(db, current.author_id, input.memberOnly, Boolean(current.member_only));
    const slug = owner && input.slug !== undefined
      ? await ensureUniqueBlogSlug(db, slugify(input.slug), id, { authorId: current.author_id, publishAs: target.publishedAs })
      : current.slug;
    const now = Math.floor(Date.now() / 1000);
    const secret = current.status === 'draft' && input.secret !== undefined ? input.secret : Boolean(current.secret);
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(current.author_id).first();
    const discovery = contentDiscoveryMetadata({
      language: input.language ?? current.language,
      region: input.region ?? current.region,
      locale: profile?.locale,
      headers: request.headers,
    });

    await db.prepare(`
      UPDATE blogs SET title = ?, subtitle = ?, slug = ?, content = ?, excerpt = ?, published_as = ?,
        collection_id = ?, page_emoji = ?, cover_image_r2_key = ?, cover_pos_x = ?, cover_pos_y = ?,
        cover_zoom = ?, secret = ?, member_only = ?, license = ?, language = ?, region = ?, allow_comments = ?, read_time_minutes = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      input.title ?? current.title ?? '', input.subtitle ?? current.subtitle ?? '', slug,
      compressBlogContent(content), excerptFromBlocks(content), target.publishedAs, target.collectionId,
      input.emoji ?? current.page_emoji ?? '', input.coverUrl ?? current.cover_image_r2_key ?? '',
      input.coverPosition?.x ?? current.cover_pos_x ?? 50, input.coverPosition?.y ?? current.cover_pos_y ?? 50,
      input.coverZoom ?? current.cover_zoom ?? 1,
      secret ? 1 : 0, (input.memberOnly ?? Boolean(current.member_only)) ? 1 : 0,
      input.license ?? current.license ?? 'all-rights-reserved',
      discovery.language, discovery.region,
      (input.allowComments ?? Boolean(current.allow_comments)) ? 1 : 0,
      readTimeFromWords(countBlockWords(content)), now, id,
    ).run();
    if (input.tags !== undefined) {
      await db.prepare('DELETE FROM blog_tags WHERE blog_id = ?').bind(id).run();
      for (const tag of input.tags) {
        await db.prepare('INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES (?, ?)').bind(id, tag).run();
      }
    }
    const updated = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    const etag = await blogEntityTag(updated);
    if (input.content !== undefined) {
      try {
        const { snapshotVersion } = await import('../../../../../lib/blogVersions');
        await snapshotVersion(db, id, updated.content, {
          label: 'cli-edit', userId: auth.userId, throttleSeconds: 300,
        });
      } catch {}
    }
    if (updated.status !== 'draft') await invalidateBlogLifecycleCaches(id);
    if (updated.status === 'published') {
      notifySearchDiscovery(`https://blogs.elixpo.com${await getBlogCanonicalPath(db, id)}`);
    }
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'blogs.update', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, { id, slug, status: updated.status, updatedAt: now, etag }, {
      headers: { ...rateHeaders, ETag: etag },
    });
  } catch (error) {
    const known = inputErrorResponse(error);
    if (known) return apiError(context, known.code, known.message, known.status, { headers: rateHeaders });
    console.error('[api/v1/blogs] update failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be updated.', 500, { headers: rateHeaders });
  }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  const scopes = permanent
    ? ['lixblogs:blog:delete', 'lixblogs:blog:delete:permanent']
    : ['lixblogs:blog:delete'];
  const authorized = await authorizeApiRequest(request, context, scopes, permanent ? 'blogs.delete.permanent' : 'blogs.delete');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;

  try {
    const blog = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    if (!blog || !(await isBlogOwner(db, blog, auth.userId))) {
      return apiError(context, 'blog_not_found', 'The blog was not found.', 404, { headers: rateHeaders });
    }
    const precondition = await checkIfMatch(request, blog);
    if (!precondition.ok) {
      return apiError(context, precondition.code, 'The blog changed after it was loaded.', precondition.status, {
        details: { currentEtag: precondition.current }, headers: { ...rateHeaders, ETag: precondition.current },
      });
    }
    const publicUrl = blog.status === 'published'
      ? `https://blogs.elixpo.com${await getBlogCanonicalPath(db, id)}`
      : null;
    if (permanent) {
      if (request.headers.get('x-confirm-permanent-delete') !== id) {
        return apiError(context, 'confirmation_required', 'Permanent deletion requires X-Confirm-Permanent-Delete with the blog ID.', 400, { headers: rateHeaders });
      }
      try {
        const media = await db.prepare(`
          SELECT user_id, cloudinary_public_id, storage_provider, storage_cloud_name
          FROM media_uploads WHERE blog_id = ?
        `).bind(id).all();
        if (media?.results?.length) {
          const { deleteTrackedMediaBatch } = await import('../../../../../lib/mediaStorage');
          await deleteTrackedMediaBatch(db, media.results);
        }
      } catch (error) {
        console.error('[api/v1/blogs] media cleanup failed:', error?.message || error);
      }
      await db.batch([
        db.prepare('DELETE FROM subpages WHERE blog_id = ?').bind(id),
        db.prepare('DELETE FROM blog_collab_state WHERE blog_id = ?').bind(id),
        db.prepare('DELETE FROM media_uploads WHERE blog_id = ?').bind(id),
        db.prepare('DELETE FROM blogs WHERE id = ?').bind(id),
      ]);
    } else {
      if (blog.deleted_at) return apiSuccess(context, { id, trashed: true }, { headers: rateHeaders });
      const now = Math.floor(Date.now() / 1000);
      await db.prepare(`
        UPDATE blogs SET pre_delete_status = status, status = 'trashed', deleted_at = ?, updated_at = ? WHERE id = ?
      `).bind(now, now, id).run();
    }
    await invalidateBlogLifecycleCaches(id);
    if (publicUrl) notifySearchDiscovery(publicUrl);
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: permanent ? 'blogs.delete.permanent' : 'blogs.delete', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, { id, trashed: !permanent, permanentlyDeleted: permanent }, { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/blogs] delete failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The blog could not be deleted.', 500, { headers: rateHeaders });
  }
}
