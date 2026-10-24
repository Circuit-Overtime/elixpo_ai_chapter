export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../lib/api/v1/responses';
import {
  CURATED_ENTRY_SELECT,
  getOwnedCollection,
  serializeCuratedEntry,
} from '../../../../../../lib/curatedCollections';

export async function GET(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:read'], 'collections.entries.list');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  try {
    const collection = await getOwnedCollection(db, id, auth.userId);
    if (!collection) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    const rows = await db.prepare(`${CURATED_ENTRY_SELECT}
      WHERE ce.collection_id = ? AND b.status = 'published' AND b.secret = 0 AND b.deleted_at IS NULL
      ORDER BY ce.position ASC, ce.added_at ASC
    `).bind(id).all();
    return apiSuccess(context, (rows?.results || []).map(serializeCuratedEntry), { headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'Collection entries could not be listed.', 500, { headers: rateHeaders });
  }
}

export async function POST(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'collections.entries.add');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  let input;
  try { input = await request.json(); } catch { return apiError(context, 'invalid_json', 'The request body must be valid JSON.', 400, { headers: rateHeaders }); }
  if (!input?.blogId) return apiError(context, 'blog_id_required', 'blogId is required.', 400, { headers: rateHeaders });
  try {
    const collection = await getOwnedCollection(db, id, auth.userId);
    if (!collection) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    const blog = await db.prepare(`
      SELECT b.id, b.author_id, b.status, b.secret, b.deleted_at,
        COALESCE(cp.allow_public_curation, 1) AS allow_public_curation
      FROM blogs b LEFT JOIN curation_preferences cp ON cp.user_id = b.author_id
      WHERE b.id = ? OR b.slugid = ? LIMIT 1
    `).bind(input.blogId, input.blogId).first();
    if (!blog || blog.status !== 'published' || blog.secret || blog.deleted_at) return apiError(context, 'blog_not_found', 'An accessible public blog was not found.', 404, { headers: rateHeaders });
    if (!blog.allow_public_curation && blog.author_id !== auth.userId) return apiError(context, 'curation_forbidden', 'The author does not allow third-party curation.', 403, { headers: rateHeaders });
    const last = await db.prepare('SELECT COALESCE(MAX(position), -1) AS position FROM curated_collection_entries WHERE collection_id = ?').bind(id).first();
    await db.prepare(`
      INSERT INTO curated_collection_entries
        (collection_id, blog_id, added_by, position, curator_note, category, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(collection_id, blog_id) DO UPDATE SET
        curator_note = excluded.curator_note, category = excluded.category, updated_at = unixepoch()
    `).bind(
      id, blog.id, auth.userId, Number(last?.position ?? -1) + 1,
      String(input.curatorNote || '').trim().slice(0, 500),
      String(input.category || '').trim().slice(0, 80),
    ).run();
    await db.prepare('UPDATE bookmark_collections SET updated_at = unixepoch() WHERE id = ?').bind(id).run();
    if (blog.author_id !== auth.userId && collection.visibility !== 'private') {
      const [actor, { notify }] = await Promise.all([
        db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?').bind(auth.userId).first(),
        import('../../../../../../lib/notify'),
      ]);
      await notify(db, {
        userId: blog.author_id,
        type: 'collection_add',
        actorId: auth.userId,
        actorName: actor?.display_name || actor?.username,
        actorAvatar: actor?.avatar_url,
        targetId: collection.id,
        targetTitle: collection.name,
        targetUrl: `/${actor?.username || 'user'}/reads/${collection.slug}`,
      });
    }
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.entries.add', resourceType: 'collection', resourceId: id, metadata: { blogId: blog.id } });
    return apiSuccess(context, { collectionId: id, blogId: blog.id }, { status: 201, headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'The blog could not be added to the collection.', 500, { headers: rateHeaders });
  }
}

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'collections.entries.remove');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id } = await params;
  const blogId = new URL(request.url).searchParams.get('blogId');
  if (!blogId) return apiError(context, 'blog_id_required', 'blogId is required.', 400, { headers: rateHeaders });
  try {
    const collection = await getOwnedCollection(db, id, auth.userId);
    if (!collection) return apiError(context, 'collection_not_found', 'The collection was not found.', 404, { headers: rateHeaders });
    const result = await db.prepare('DELETE FROM curated_collection_entries WHERE collection_id = ? AND blog_id = ?').bind(id, blogId).run();
    if (!result?.meta?.changes) return apiError(context, 'entry_not_found', 'The collection entry was not found.', 404, { headers: rateHeaders });
    await db.prepare('UPDATE bookmark_collections SET updated_at = unixepoch() WHERE id = ?').bind(id).run();
    await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'collections.entries.remove', resourceType: 'collection', resourceId: id, metadata: { blogId } });
    return apiSuccess(context, { removed: true, collectionId: id, blogId }, { headers: rateHeaders });
  } catch {
    return apiError(context, 'internal_error', 'The collection entry could not be removed.', 500, { headers: rateHeaders });
  }
}
