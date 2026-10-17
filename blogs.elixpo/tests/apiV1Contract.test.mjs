import test from 'node:test';
import assert from 'node:assert/strict';
import { blogEntityTag } from '../lib/api/v1/entityTag.js';
import {
  countBlockWords,
  isBlogOwner,
  normalizeBlogInput,
  normalizeTags,
  requirePublishTarget,
  slugify,
} from '../lib/api/v1/blogInput.js';
import { decodeCursor, encodeCursor, parsePage } from '../lib/api/v1/pagination.js';
import { checkIfMatch } from '../lib/api/v1/preconditions.js';
import {
  abandonIdempotentOperation,
  beginIdempotentOperation,
  completeIdempotentOperation,
  hashApiRequest,
  validateIdempotencyKey,
} from '../lib/api/v1/operations.js';

test('cursor pagination is opaque, stable, and capped at 100 rows', () => {
  const cursor = encodeCursor({ id: 'blog-1', updated_at: 1234 });
  assert.doesNotMatch(cursor, /blog-1/);
  assert.deepEqual(decodeCursor(cursor), { id: 'blog-1', updatedAt: 1234 });
  assert.deepEqual(parsePage(new URLSearchParams(`limit=500&cursor=${cursor}`)), {
    limit: 100,
    cursor: { id: 'blog-1', updatedAt: 1234 },
  });
  assert.throws(() => parsePage(new URLSearchParams('limit=0')), /invalid_limit/);
  assert.throws(() => decodeCursor('not-a-cursor'), /invalid_cursor/);
});

test('blog entity tags are stable and change with writable content', async () => {
  const blog = { id: 'blog-1', title: 'Title', content: 'one', updated_at: 1 };
  assert.equal(await blogEntityTag(blog), await blogEntityTag({ ...blog }));
  assert.notEqual(await blogEntityTag(blog), await blogEntityTag({ ...blog, content: 'two' }));
});

test('blog entity tags change with publication settings', async () => {
  const blog = {
    id: 'blog-1',
    slug: 'first-slug',
    status: 'published',
    updated_at: 1,
    title: 'Title',
    subtitle: 'Punchline',
    content: 'one',
    excerpt: 'Excerpt',
    cover_image_r2_key: 'covers/first.webp',
    cover_pos_x: 50,
    cover_pos_y: 50,
    cover_zoom: 1,
    page_emoji: '📝',
    published_as: 'personal',
    collection_id: null,
    secret: 0,
    member_only: 0,
    license: 'all-rights-reserved',
    language: 'en',
    region: 'global',
    allow_comments: 1,
  };
  const original = await blogEntityTag(blog);
  const changes = {
    title: 'Updated title',
    subtitle: 'Updated punchline',
    slug: 'second-slug',
    excerpt: 'Updated excerpt',
    cover_image_r2_key: 'covers/second.webp',
    cover_pos_x: 25,
    cover_pos_y: 75,
    cover_zoom: 1.25,
    page_emoji: '🚀',
    published_as: 'org:org-1',
    collection_id: 'collection-1',
    secret: 1,
    member_only: 1,
    license: 'cc-by-4.0',
    language: 'bn',
    region: 'in',
    allow_comments: 0,
  };

  for (const [field, value] of Object.entries(changes)) {
    assert.notEqual(
      await blogEntityTag({ ...blog, [field]: value }),
      original,
      `${field} must affect the blog entity tag`,
    );
  }
});

test('blog input is bounded and normalized for API writes', () => {
  assert.deepEqual(normalizeTags([' Tech ', 'tech', 'Web']), ['tech', 'web']);
  assert.equal(slugify(' A Better CLI! '), 'a-better-cli');
  assert.equal(countBlockWords([{ content: [{ type: 'text', text: 'one two three' }] }]), 3);
  assert.deepEqual(normalizeBlogInput({ title: ' Draft ', content: [], memberOnly: false }), {
    title: 'Draft',
    content: [],
    tags: undefined,
    memberOnly: false,
  });
  assert.throws(() => normalizeBlogInput({ content: 'markdown' }), /block array/);
  assert.throws(() => normalizeBlogInput({ content: [], coverUrl: 'http://example.com/image.png' }), /HTTPS/);
});

test('accepts secret mode as a boolean draft setting', () => {
  assert.equal(normalizeBlogInput({ secret: true }, { partial: true }).secret, true);
  assert.equal(normalizeBlogInput({ secret: false }, { partial: true }).secret, false);
  assert.throws(() => normalizeBlogInput({ secret: 'true' }, { partial: true }), /must be boolean/);
});

test('write preconditions require and compare strong entity tags', async () => {
  const blog = { id: 'blog-1', title: 'Title', content: 'one', updated_at: 1 };
  const etag = await blogEntityTag(blog);
  const missing = await checkIfMatch(new Request('https://blogs.elixpo.com/api/v1/blogs/blog-1'), blog);
  assert.equal(missing.status, 428);
  const stale = await checkIfMatch(new Request('https://blogs.elixpo.com/api/v1/blogs/blog-1', {
    headers: { 'if-match': '"stale"' },
  }), blog);
  assert.equal(stale.status, 412);
  const current = await checkIfMatch(new Request('https://blogs.elixpo.com/api/v1/blogs/blog-1', {
    headers: { 'if-match': etag },
  }), blog);
  assert.equal(current.ok, true);
});

test('publication targets require a write-capable organization relationship', async () => {
  const denied = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
  await assert.rejects(
    requirePublishTarget(denied, 'user-1', 'org:org-1'),
    (error) => error.code === 'publication_forbidden',
  );

  const allowed = {
    prepare(sql) {
      return { bind: () => ({ first: async () => /org_members/.test(sql) ? { ok: 1 } : null }) };
    },
  };
  assert.deepEqual(await requirePublishTarget(allowed, 'user-1', 'org:org-1'), {
    publishedAs: 'org:org-1', collectionId: null,
  });
  assert.equal(await isBlogOwner(allowed, { author_id: 'user-1' }, 'user-1'), true);
});

function idempotencyDb() {
  const rows = new Map();
  const rowKey = (values) => values.slice(0, 3).join('|');
  return {
    rows,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (/DELETE FROM api_idempotency_keys/.test(sql)) {
                const key = rowKey(values);
                const row = rows.get(key);
                const removable = /status_code IS NULL/.test(sql)
                  ? row && row.request_hash === values[3] && row.status_code === null
                  : row && row.expires_at <= values[3];
                if (removable) rows.delete(key);
                return { meta: { changes: removable ? 1 : 0 } };
              }
              if (/INSERT OR IGNORE/.test(sql)) {
                const key = rowKey(values);
                if (rows.has(key)) return { meta: { changes: 0 } };
                rows.set(key, {
                  request_hash: values[3],
                  status_code: null,
                  response_body: null,
                  expires_at: values[5],
                });
                return { meta: { changes: 1 } };
              }
              if (/UPDATE api_idempotency_keys/.test(sql)) {
                const key = values.slice(2, 5).join('|');
                const row = rows.get(key);
                if (!row || row.request_hash !== values[5]) return { meta: { changes: 0 } };
                row.status_code = values[0];
                row.response_body = values[1];
                return { meta: { changes: 1 } };
              }
              throw new Error(`unexpected run: ${sql}`);
            },
            async first() {
              if (/SELECT request_hash/.test(sql)) return rows.get(rowKey(values)) || null;
              throw new Error(`unexpected first: ${sql}`);
            },
          };
        },
      };
    },
  };
}

test('idempotency reserves, rejects concurrent reuse, and replays a completed result', async () => {
  const db = idempotencyDb();
  const requestHash = await hashApiRequest({ title: 'First' });
  const input = { userId: 'user-1', operation: 'blogs.create', key: 'request-123', requestHash };

  assert.deepEqual(await beginIdempotentOperation(db, input), { state: 'started' });
  await assert.rejects(beginIdempotentOperation(db, input), (error) => error.code === 'idempotency_in_progress');
  await completeIdempotentOperation(db, { ...input, status: 201, body: { data: { id: 'blog-1' } } });
  assert.deepEqual(await beginIdempotentOperation(db, input), {
    state: 'replay',
    status: 201,
    body: { data: { id: 'blog-1' } },
  });
});

test('idempotency rejects a key reused for different input', async () => {
  const db = idempotencyDb();
  const input = {
    userId: 'user-1',
    operation: 'blogs.create',
    key: 'request-456',
    requestHash: await hashApiRequest({ title: 'First' }),
  };
  await beginIdempotentOperation(db, input);
  await assert.rejects(
    beginIdempotentOperation(db, { ...input, requestHash: await hashApiRequest({ title: 'Second' }) }),
    (error) => error.code === 'idempotency_key_reused',
  );
  assert.throws(() => validateIdempotencyKey('short'), /between 8 and 128/);
});

test('an uncommitted idempotency reservation can be abandoned after validation fails', async () => {
  const db = idempotencyDb();
  const input = {
    userId: 'user-1',
    operation: 'blogs.publish',
    key: 'publish-request',
    requestHash: await hashApiRequest({ id: 'blog-1', etag: '"old"' }),
  };
  assert.equal((await beginIdempotentOperation(db, input)).state, 'started');
  await abandonIdempotentOperation(db, input);
  assert.equal((await beginIdempotentOperation(db, input)).state, 'started');
});
