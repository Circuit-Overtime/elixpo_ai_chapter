import assert from 'node:assert/strict';
import test from 'node:test';

import { ContestClient } from '../src/api/ContestClient.js';

function response(data) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('contest client uses blog scopes and immutable submission route', async () => {
  const calls = [], scopes = [];
  const client = new ContestClient({
    requireScopes: async (required) => scopes.push(required),
    request: async (path, options = {}) => { calls.push({ path, options }); return response([]); },
  });
  await client.submissions('contest one', { snapshot: true });
  await client.submit('contest one', 'blog-1');
  assert.deepEqual(scopes, [['lixblogs:blog:read'], ['lixblogs:blog:write']]);
  assert.equal(calls[0].path, '/api/v1/contests/contest%20one/submissions?snapshot=true');
  assert.equal(JSON.parse(calls[1].options.body).blogId, 'blog-1');
});

test('contest result publication requires the publish scope', async () => {
  const scopes = [];
  let body;
  const client = new ContestClient({
    requireScopes: async (required) => scopes.push(required),
    request: async (_path, options = {}) => { body = JSON.parse(options.body); return response({ finalized: true }); },
  });
  await client.results('contest-1', [{ placement: 'winner', submissionId: 'submission-1' }], true);
  assert.deepEqual(scopes, [['lixblogs:blog:publish']]);
  assert.equal(body.finalize, true);
});

test('contest list supports lifecycle and organizer filters', async () => {
  const calls = [];
  const client = new ContestClient({
    requireScopes: async () => {},
    request: async (path, options = {}) => { calls.push({ path, options }); return response([]); },
  });
  await client.list({ status: 'live', mine: true });
  assert.equal(calls[0].path, '/api/v1/contests?status=live&mine=true');
});

test('contest draft deletion requires the delete scope', async () => {
  const scopes = [];
  let method;
  const client = new ContestClient({
    requireScopes: async (required) => scopes.push(required),
    request: async (_path, options = {}) => { method = options.method; return response({ deleted: true }); },
  });
  await client.delete('contest-1');
  assert.deepEqual(scopes, [['lixblogs:blog:delete']]);
  assert.equal(method, 'DELETE');
});
