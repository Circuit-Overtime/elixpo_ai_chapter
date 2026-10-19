import { blogEntityTag } from './entityTag.js';

export async function checkIfMatch(request, blog) {
  const supplied = request.headers.get('if-match');
  const current = await blogEntityTag(blog);
  if (!supplied) return { ok: false, status: 428, code: 'precondition_required', current };
  if (supplied !== current && supplied !== '*') {
    return { ok: false, status: 412, code: 'revision_conflict', current };
  }
  return { ok: true, current };
}
