export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../lib/api/v1/responses';
import {
  COLLECTION_VISIBILITIES,
  collectionSlug,
  curatedCoverUrl,
  serializeCuratedCollection,
} from '../../../../lib/curatedCollections';

export async function GET(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'collections.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  try {
    const rows = await db.prepare(`
      SELECT bc.*,
        (SELECT COUNT(*) FROM curated_collection_entries ce WHERE ce.collection_id = bc.id) AS entry_count
      FROM bookmark_collections bc WHERE bc.user_id = ?
      ORDER BY bc.updated_at DESC
    `).bind(auth.userId).all();
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.list', resourceType: 'collection' });
    return apiSuccess(context, (rows?.results || []).map(serializeCuratedCollection), { headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/collections] list failed:', error?.message || error);
    return apiError(context, 'internal_error', 'Collections could not be listed.', 500, { headers: rateHeaders });
  }
}

export async function POST(request) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'collections.create');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }

  const name = String(input?.name || '').trim();
  const base = collectionSlug(input?.slug || name);
  const visibility = input?.visibility || 'private';
  if (!name || name.length > 120 || base.length < 3) return apiError(context, 'invalid_collection', 'A collection name and valid slug are required.', 400, { headers: rateHeaders });
  if (!COLLECTION_VISIBILITIES.has(visibility)) return apiError(context, 'invalid_visibility', 'Visibility must be private, unlisted, or public.', 400, { headers: rateHeaders });
  let coverUrl;
  try { coverUrl = curatedCoverUrl(input.coverUrl); } catch { return apiError(context, 'invalid_cover_url', 'coverUrl must use HTTPS.', 400, { headers: rateHeaders }); }

  try {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM bookmark_collections WHERE user_id = ?').bind(auth.userId).first();
    if (Number(count?.count || 0) >= 50) return apiError(context, 'collection_limit', 'An account can own at most 50 collections.', 409, { headers: rateHeaders });
    let slug = base;
    let suffix = 1;
    while (await db.prepare('SELECT 1 FROM bookmark_collections WHERE user_id = ? AND slug = ?').bind(auth.userId, slug).first()) slug = `${base}-${++suffix}`;
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO bookmark_collections
        (id, user_id, name, description, introduction, cover_url, slug, is_public, visibility, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `).bind(
      id, auth.userId, name, String(input.description || '').trim().slice(0, 500),
      String(input.introduction || '').trim().slice(0, 5000), coverUrl,
      slug, visibility === 'public' ? 1 : 0, visibility,
    ).run();
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.create', resourceType: 'collection', resourceId: id });
    return apiSuccess(context, { id, name, slug, visibility, count: 0 }, { status: 201, headers: rateHeaders });
  } catch (error) {
    console.error('[api/v1/collections] create failed:', error?.message || error);
    return apiError(context, 'internal_error', 'The collection could not be created.', 500, { headers: rateHeaders });
  }
}
