import assert from 'node:assert/strict';
import test from 'node:test';

import { CollectionClient } from '../src/api/CollectionClient.js';

function response(data, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? { error: data } : { data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('collection client uses blog scopes and collection API routes', async () => {
  const calls = [];
  const scopes = [];
  const client = new CollectionClient({
    requireScopes: async (required) => scopes.push(required),
    request: async (path, options = {}) => {
      calls.push({ path, options });
      return response(path.endsWith('/entries') ? [] : { id: 'collection-1' });
    },
  });

  await client.get('collection-1');
  await client.add('collection-1', { blogId: 'blog-1' });
  await client.entries('collection-1');

  assert.deepEqual(scopes, [
    ['lixblogs:blog:read'],
    ['lixblogs:blog:write'],
    ['lixblogs:blog:read'],
  ]);
  assert.equal(calls[0].path, '/api/v1/collections/collection-1');
  assert.equal(calls[1].path, '/api/v1/collections/collection-1/entries');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(JSON.parse(calls[1].options.body).blogId, 'blog-1');
});

test('collection client removes a specific blog entry', async () => {
  let request;
  const client = new CollectionClient({
    requireScopes: async () => {},
    request: async (path, options) => {
      request = { path, options };
      return response({ removed: true });
    },
  });
  await client.remove('collection-1', 'blog/with spaces');
  assert.equal(request.path, '/api/v1/collections/collection-1/entries?blogId=blog%2Fwith%20spaces');
  assert.equal(request.options.method, 'DELETE');
});
