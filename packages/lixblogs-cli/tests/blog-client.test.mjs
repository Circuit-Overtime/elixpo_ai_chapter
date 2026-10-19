import test from 'node:test';
import assert from 'node:assert/strict';
import { BlogApiError, BlogClient } from '../src/api/BlogClient.js';

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('list carries bounded pagination and returns the stable envelope', async () => {
  let requested;
  const client = new BlogClient({ request: async (url) => {
    requested = url;
    return response({ data: [{ id: 'one' }], meta: { nextCursor: 'next' } });
  } });
  const result = await client.list({ status: 'draft', limit: 5, cursor: 'cursor' });
  assert.match(requested, /status=draft/);
  assert.match(requested, /limit=5/);
  assert.match(requested, /cursor=cursor/);
  assert.equal(result.meta.nextCursor, 'next');
});

test('create and publish send idempotency and revision headers', async () => {
  const requests = [];
  const client = new BlogClient({ request: async (url, options) => {
    requests.push({ url, options });
    return response({ data: { id: 'blog-1' } });
  } });
  await client.create({ title: 'Draft', content: [] }, { idempotencyKey: 'create-key' });
  await client.publish('blog-1', { etag: '"revision"', idempotencyKey: 'publish-key' });
  assert.equal(requests[0].options.headers['idempotency-key'], 'create-key');
  assert.equal(requests[1].options.headers['if-match'], '"revision"');
  assert.equal(requests[1].options.headers['idempotency-key'], 'publish-key');
});

test('profile updates require the write scope and use the v1 identity endpoint', async () => {
  const calls = [];
  const client = new BlogClient({
    requireScopes: async (scopes) => calls.push({ scopes }),
    request: async (url, options) => {
      calls.push({ url, options });
      return response({ data: { username: 'writer', designation: 'Technical writer' } });
    },
  });
  const profile = await client.updateProfile({ designation: 'Technical writer' });
  assert.deepEqual(calls[0].scopes, ['lixblogs:profile:write']);
  assert.equal(calls[1].url, '/api/v1/me');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(JSON.parse(calls[1].options.body).designation, 'Technical writer');
  assert.equal(profile.designation, 'Technical writer');
});

test('get prefers the strong payload ETag when an edge rewrites the response header', async () => {
  const client = new BlogClient({ request: async () => response({
    data: { id: 'blog-1', etag: '"strong"' },
  }, 200, { etag: 'W/"strong"' }) });

  assert.equal((await client.get('blog-1')).etag, '"strong"');
});

test('an individual historical version can be inspected before restore', async () => {
  let requested;
  const client = new BlogClient({ request: async (url) => {
    requested = url;
    return response({ data: { id: 'version-1', content: [] } });
  } });

  const version = await client.version('blog-1', 'version-1');
  assert.equal(version.id, 'version-1');
  assert.match(requested, /\/api\/v1\/blogs\/blog-1\/versions\?version=version-1$/);
});

test('API errors retain machine code, request ID, and conflict details', async () => {
  const client = new BlogClient({ request: async () => response({
    error: {
      code: 'revision_conflict',
      message: 'Changed',
      requestId: 'request-1',
      details: { currentEtag: '"new"' },
    },
  }, 412) });
  await assert.rejects(client.get('blog-1'), (error) => {
    assert.ok(error instanceof BlogApiError);
    assert.equal(error.code, 'revision_conflict');
    assert.equal(error.requestId, 'request-1');
    assert.equal(error.details.currentEtag, '"new"');
    return true;
  });
});

test('safe and idempotent requests retry one transient response', async () => {
  let calls = 0;
  const client = new BlogClient({ request: async () => {
    calls += 1;
    return calls === 1
      ? response({ error: { code: 'busy', message: 'Busy' } }, 503)
      : response({ data: [] });
  } }, { sleep: async () => {} });
  assert.deepEqual((await client.list()).data, []);
  assert.equal(calls, 2);
});
