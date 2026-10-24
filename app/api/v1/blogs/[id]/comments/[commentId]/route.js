export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { authorizeApiRequest } from '../../../../../../../lib/api/v1/authorize';
import { recordApiAudit } from '../../../../../../../lib/api/v1/operations';
import { apiError, apiSuccess, requestContext } from '../../../../../../../lib/api/v1/responses';

export async function DELETE(request, { params }) {
  const context = requestContext();
  const authorized = await authorizeApiRequest(request, context, ['lixblogs:blog:write'], 'comments.delete');
  if (authorized.response) return authorized.response;
  const { auth, db, rateHeaders } = authorized;
  const { id, commentId } = await params;
  const comment = await db.prepare('SELECT user_id FROM comments WHERE id=? AND blog_id=?').bind(commentId, id).first();
  const blog = await db.prepare('SELECT author_id FROM blogs WHERE id=?').bind(id).first();
  if (!comment || (comment.user_id !== auth.userId && blog?.author_id !== auth.userId)) return apiError(context, 'comment_not_found', 'The comment was not found.', 404, { headers: rateHeaders });
  await db.batch([
    db.prepare('DELETE FROM comments WHERE parent_id=?').bind(commentId),
    db.prepare('DELETE FROM comments WHERE id=?').bind(commentId),
    db.prepare('UPDATE blogs SET comment_count=(SELECT COUNT(*) FROM comments WHERE blog_id=?) WHERE id=?').bind(id, id),
  ]);
  await recordApiAudit(db, { requestId: context.requestId, userId: auth.userId, clientId: auth.clientId, action: 'comments.delete', resourceType: 'comment', resourceId: commentId });
  return apiSuccess(context, { id: commentId, deleted: true }, { headers: rateHeaders });
}
