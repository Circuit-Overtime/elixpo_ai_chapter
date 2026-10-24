import { byteLength, MAX_BLOG_CONTENT_BYTES, MAX_SUBTITLE_LEN, MAX_TITLE_LEN } from '../../limits.js';
import { BLOG_LICENSES } from '../../curatedCollections.js';

export class BlogInputError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'BlogInputError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) throw new BlogInputError('invalid_tags', 'tags must be an array.');
  return [...new Set(tags
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))].slice(0, 5);
}

export function normalizeBlogInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BlogInputError('invalid_request', 'A JSON object is required.');
  }
  const output = {};
  const copyString = (key, max) => {
    if (body[key] === undefined) return;
    if (typeof body[key] !== 'string' || body[key].length > max) {
      throw new BlogInputError(`invalid_${key}`, `${key} is invalid.`);
    }
    output[key] = body[key].trim();
  };
  copyString('title', MAX_TITLE_LEN);
  copyString('subtitle', MAX_SUBTITLE_LEN);
  copyString('slug', 120);
  copyString('emoji', 32);
  copyString('publishedAs', 128);
  copyString('collectionId', 128);
  copyString('coverUrl', 2048);
  copyString('license', 40);
  copyString('language', 16);
  copyString('region', 16);
  if (output.license && !BLOG_LICENSES.has(output.license)) {
    throw new BlogInputError('invalid_license', 'license is not supported.');
  }
  if (output.coverUrl && !/^https:\/\//i.test(output.coverUrl)) {
    throw new BlogInputError('invalid_coverUrl', 'coverUrl must use HTTPS.');
  }
  if (output.language !== undefined && !/^(und|[a-z]{2,3})(?:-[a-z0-9]{2,8})*$/i.test(output.language)) {
    throw new BlogInputError('invalid_language', 'language must be a BCP-47 language tag or und.');
  }
  if (output.region !== undefined && !/^(global|[a-z]{2})$/i.test(output.region)) {
    throw new BlogInputError('invalid_region', 'region must be a two-letter country code or global.');
  }

  if (!partial && output.title === undefined) output.title = '';
  if (body.content !== undefined) {
    if (!Array.isArray(body.content) || byteLength(body.content) > MAX_BLOG_CONTENT_BYTES) {
      throw new BlogInputError('invalid_content', 'content must be a block array within the size limit.', 413);
    }
    output.content = body.content;
  } else if (!partial) output.content = [];

  output.tags = normalizeTags(body.tags);
  for (const key of ['secret', 'memberOnly']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') throw new BlogInputError(`invalid_${key}`, `${key} must be boolean.`);
      output[key] = body[key];
    }
  }
  if (body.allowComments !== undefined) {
    if (typeof body.allowComments !== 'boolean') throw new BlogInputError('invalid_allowComments', 'allowComments must be boolean.');
    output.allowComments = body.allowComments;
  }
  if (body.coverPosition !== undefined) {
    const x = Number(body.coverPosition?.x);
    const y = Number(body.coverPosition?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      throw new BlogInputError('invalid_coverPosition', 'coverPosition x and y must be between 0 and 100.');
    }
    output.coverPosition = { x, y };
  }
  if (body.coverZoom !== undefined) {
    const zoom = Number(body.coverZoom);
    if (!Number.isFinite(zoom) || zoom < 0.5 || zoom > 4) throw new BlogInputError('invalid_coverZoom', 'coverZoom must be between 0.5 and 4.');
    output.coverZoom = zoom;
  }
  return output;
}

export function slugify(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function countBlockWords(blocks) {
  let text = '';
  const walk = (items) => {
    for (const block of items || []) {
      for (const item of block?.content || []) text += ` ${typeof item === 'string' ? item : item?.text || ''}`;
      if (block?.children) walk(block.children);
    }
  };
  walk(blocks);
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export async function requirePublishTarget(db, userId, publishedAs = 'personal', collectionId = null) {
  if (publishedAs === 'personal') return { publishedAs, collectionId: null };
  if (!/^org:[^:]+$/.test(publishedAs)) {
    throw new BlogInputError('invalid_publication', 'publishedAs must be personal or org:<id>.');
  }
  const orgId = publishedAs.slice(4);
  const membership = await db.prepare(`
    SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?
      AND role IN ('admin','maintain','write')
  `).bind(orgId, userId).first();
  const owner = membership || await db.prepare('SELECT 1 FROM orgs WHERE id = ? AND owner_id = ?')
    .bind(orgId, userId).first();
  if (!owner) throw new BlogInputError('publication_forbidden', 'You cannot publish to this organization.', 403);
  if (!collectionId) return { publishedAs, collectionId: null };
  const collection = await db.prepare('SELECT 1 FROM collections WHERE id = ? AND org_id = ?')
    .bind(collectionId, orgId).first();
  if (!collection) throw new BlogInputError('invalid_collection', 'The collection does not belong to this organization.');
  return { publishedAs, collectionId };
}

export async function isBlogOwner(db, blog, userId) {
  if (blog.author_id === userId) return true;
  if (!blog.published_as?.startsWith('org:')) return false;
  const orgId = blog.published_as.slice(4);
  const row = await db.prepare(`
    SELECT 1 FROM orgs o LEFT JOIN org_members m
      ON m.org_id = o.id AND m.user_id = ? AND m.role = 'admin'
    WHERE o.id = ? AND (o.owner_id = ? OR m.user_id IS NOT NULL)
  `).bind(userId, orgId, userId).first();
  return Boolean(row);
}

export async function requireMemberOnlyAllowed(db, authorId, requested, grandfathered = false) {
  if (!requested || grandfathered) return;
  const owner = await db.prepare('SELECT tier FROM users WHERE id = ?').bind(authorId).first();
  const { getLimits } = await import('../../tiers.js');
  if (!getLimits(owner?.tier).canMarkMemberOnly) {
    throw new BlogInputError(
      'member_only_forbidden',
      'This author plan cannot mark a new post as member-only.',
      403,
    );
  }
}

export function inputErrorResponse(error) {
  return error?.name === 'BlogInputError' ? error : null;
}
