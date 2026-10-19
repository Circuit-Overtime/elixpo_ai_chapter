export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../lib/api/v1/responses';
import { COLLECTION_VISIBILITIES, curatedCoverUrl, getOwnedCollection, serializeCuratedCollection } from '../../../../../lib/curatedCollections';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'collections.get');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const collection = await getOwnedCollection(db, id, auth.userId);
    if (!collection) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    return apiSuccess(context, serializeCuratedCollection(collection), { headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'The collection could not be loaded.', 500, { headers: rateHeaders });
  }
}

export async function PATCH(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'collections.update');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  if (input.visibility !== undefined && !COLLECTION_VISIBILITIES.has(input.visibility)) return apiError(context, 'invalid_visibility', 'Visibility must be private, unlisted, or public.', 400, { headers: rateHeaders });
  let coverUrl = input.coverUrl;
  try { if (input.coverUrl !== undefined) coverUrl = curatedCoverUrl(input.coverUrl); } catch { return apiError(context, 'invalid_cover_url', 'coverUrl must use HTTPS.', 400, { headers: rateHeaders }); }
  try {
    const collection = await getOwnedCollection(db, id, auth.userId);
    if (!collection) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    await db.prepare(`
      UPDATE bookmark_collections SET
        name = ?, description = ?, introduction = ?, cover_url = ?, visibility = ?,
        is_public = ?, updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).bind(
      input.name === undefined ? collection.name : String(input.name).trim().slice(0, 120),
      input.description === undefined ? collection.description : String(input.description).trim().slice(0, 500),
      input.introduction === undefined ? collection.introduction : String(input.introduction).trim().slice(0, 5000),
      input.coverUrl === undefined ? collection.cover_url : coverUrl,
      input.visibility || collection.visibility,
      (input.visibility || collection.visibility) === 'public' ? 1 : 0,
      id, auth.userId,
    ).run();
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.update', resourceType: 'collection', resourceId: id });
    const updated = await getOwnedCollection(db, id, auth.userId);
    return apiSuccess(context, serializeCuratedCollection(updated), { headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'The collection could not be updated.', 500, { headers: rateHeaders });
  }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'collections.delete');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const result = await db.prepare('DELETE FROM bookmark_collections WHERE id = ? AND user_id = ?').bind(id, auth.userId).run();
    if (!result?.meta?.changes) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.delete', resourceType: 'collection', resourceId: id });
    return apiSuccess(context, { deleted: true, id }, { headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'The collection could not be deleted.', 500, { headers: rateHeaders });
  }
}
