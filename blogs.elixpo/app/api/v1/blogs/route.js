export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import {
  inputErrorResponse,
  normalizeBlogInput,
  requireMemberOnlyAllowed,
  requirePublishTarget,
  slugify,
} from '../../../../lib/api/v1/blogInput';
import { blogEntityTag } from '../../../../lib/api/v1/entityTag';
import { encodeCursor, parsePage } from '../../../../lib/api/v1/pagination';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  hashApiRequest,
  recordApiAudit,
} from '../../../../lib/api/v1/operations';
import { compressBlogContent } from '../../../../lib/compress';
import { excerptFromBlocks } from '../../../../lib/excerpt';
import { ensureUniqueBlogSlug } from '../../../../lib/namespace';
import { credentialAllowsPublishedAs } from '../../../../lib/api/v1/personalAccessTokens';
import { contentDiscoveryMetadata } from '../../../../lib/recommendations';

const LIST_SCOPE = 'lixblogs:blog:read';
const ALLOWED_STATUSES = new Set(['all', 'draft', 'published', 'unlisted', 'trashed']);

function serializeBlog(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title || '',
    subtitle: row.subtitle || '',
    status: row.status,
    authorId: row.author_id,
    publishedAs: row.published_as,
    collectionId: row.collection_id || null,
    emoji: row.page_emoji || null,
    coverUrl: row.cover_image_r2_key || null,
    memberOnly: Boolean(row.member_only),
    license: row.license || 'all-rights-reserved',
    language: row.language || 'und',
    region: row.region || 'global',
    secret: Boolean(row.secret),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    deletedAt: row.deleted_at || null,
  };
}

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, [LIST_SCOPE], 'blogs.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get('status') || 'all';
  if (!ALLOWED_STATUSES.has(status)) {
    return apiError(context, 'invalid_status', 'status must be all, draft, published, unlisted, or trashed.', 400, { headers: rateHeaders });
  }

  let page;
  try {
    page = parsePage(searchParams);
  } catch (error) {
    const code = error.message === 'invalid_limit' ? 'invalid_limit' : 'invalid_cursor';
    return apiError(context, code, 'The pagination parameters are invalid.', 400, { headers: rateHeaders });
  }

  const filters = [];
  const bindings = [auth.userId, auth.userId, auth.userId];
  if (status === 'all') {
    filters.push('b.deleted_at IS NULL');
  } else if (status === 'trashed') {
    filters.push('b.deleted_at IS NOT NULL');
  } else {
    filters.push('b.status = ?');
    bindings.push(status);
    filters.push('b.deleted_at IS NULL');
  }
  if (auth.credentialType === 'pat') {
    if (auth.resourceType === 'organization') {
      filters.push('b.published_as = ?');
      bindings.push(`org:${auth.organizationId}`);
    } else {
      filters.push("(b.published_as IS NULL OR b.published_as = 'personal')");
    }
  }
  if (page.cursor) {
    filters.push('(b.updated_at < ? OR (b.updated_at = ? AND b.id < ?))');
    bindings.push(page.cursor.updatedAt, page.cursor.updatedAt, page.cursor.id);
  }
  bindings.push(page.limit + 1);

  try {
    const rows = await db.prepare(`
      SELECT b.id, b.slug, b.title, b.subtitle, b.status, b.author_id,
        b.published_as, b.collection_id, b.page_emoji, b.cover_image_r2_key,
        b.member_only, b.secret, b.license, b.created_at, b.updated_at, b.published_at, b.deleted_at
      FROM blogs b
      WHERE (
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
      ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
      ORDER BY b.updated_at DESC, b.id DESC
      LIMIT ?
    `).bind(...bindings).all();

    const results = rows?.results || [];
    const hasMore = results.length > page.limit;
    const visible = hasMore ? results.slice(0, page.limit) : results;
    const nextCursor = hasMore && visible.length ? encodeCursor(visible[visible.length - 1]) : null;

    await recordApiAudit(db, {
      requestId: context.requestId,
      userId: auth.userId,
      clientId: auth.clientId,
      action: 'blogs.list',
      resourceType: 'blog',
    });

    return apiSuccess(context, visible.map(serializeBlog), {
      meta: { limit: page.limit, hasMore, nextCursor },
      headers: rateHeaders,
    });
  } catch (error) {
    console.error('[api/v1/blogs] list failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Blogs could not be listed.', 500, { headers: rateHeaders });
  }
}

export async function POST(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'blogs.create');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;

  let body;
  let input;
  try {
    body = await request.json();
    input = normalizeBlogInput(body);
  } catch (error) {
    const known = inputErrorResponse(error);
    return apiError(context, known?.code || 'invalid_json', known?.message || 'A valid JSON body is required.', known?.status || 400, { headers: rateHeaders });
  }

  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey) {
    return apiError(context, 'idempotency_key_required', 'Idempotency-Key is required.', 400, { headers: rateHeaders });
  }
  const requestHash = await hashApiRequest(body);
  try {
    const target = await requirePublishTarget(db, auth.userId, input.publishedAs || 'personal', input.collectionId || null);
    if (!credentialAllowsPublishedAs(auth, target.publishedAs)) {
      return apiError(context, 'credential_scope_forbidden', 'This token cannot publish to that account or organization.', 403, { headers: rateHeaders });
    }
    await requireMemberOnlyAllowed(db, auth.userId, input.memberOnly, false);
    const reservation = await beginIdempotentOperation(db, {
      userId: auth.userId, operation: 'blogs.create', key: idempotencyKey, requestHash,
    });
    if (reservation.state === 'replay') {
      return apiSuccess(context, reservation.body.data, { status: reservation.status, headers: { ...rateHeaders, 'Idempotent-Replayed': 'true' } });
    }

    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const slug = await ensureUniqueBlogSlug(db, slugify(input.slug || input.title), id, {
      authorId: auth.userId,
      publishAs: target.publishedAs,
    });
    const compressed = compressBlogContent(input.content);
    const excerpt = excerptFromBlocks(input.content);
    const profile = await db.prepare('SELECT locale FROM users WHERE id = ?').bind(auth.userId).first();
    const discovery = contentDiscoveryMetadata({ language: input.language, region: input.region, locale: profile?.locale, headers: request.headers });
    const preference = await db.prepare('SELECT default_license FROM curation_preferences WHERE user_id = ?').bind(auth.userId).first();
    const license = input.license || preference?.default_license || 'all-rights-reserved';
    await db.prepare(`
      INSERT INTO blogs
        (id, slug, title, subtitle, content, excerpt, author_id, published_as, collection_id,
         status, page_emoji, cover_image_r2_key, secret, member_only, license, language, region, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, slug, input.title, input.subtitle || '', compressed, excerpt, auth.userId,
      target.publishedAs, target.collectionId, input.emoji || '', input.coverUrl || '',
      input.secret ? 1 : 0, input.memberOnly ? 1 : 0, license, discovery.language, discovery.region, now, now,
    ).run();
    try {
      const { snapshotVersion } = await import('../../../../lib/blogVersions');
      await snapshotVersion(db, id, compressed, { label: 'draft', userId: auth.userId });
    } catch {}
    for (const tag of input.tags || []) {
      await db.prepare('INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES (?, ?)').bind(id, tag).run();
    }
    const row = await db.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    const result = { id, slug, status: 'draft', updatedAt: now, etag: await blogEntityTag(row) };
    await completeIdempotentOperation(db, {
      userId: auth.userId, operation: 'blogs.create', key: idempotencyKey, requestHash,
      status: 201, body: { data: result },
    });
    await recordApiAudit(db, {
      requestId: context.requestId, userId: auth.userId, clientId: auth.clientId,
      action: 'blogs.create', resourceType: 'blog', resourceId: id,
    });
    return apiSuccess(context, result, { status: 201, headers: { ...rateHeaders, ETag: result.etag } });
  } catch (error) {
    const known = inputErrorResponse(error) || (error?.name === 'IdempotencyError' ? error : null);
    if (known) return apiError(context, known.code, known.message, known.status, { headers: rateHeaders });
    console.error('[api/v1/blogs] create failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The draft could not be created.', 500, { headers: rateHeaders });
  }
}
