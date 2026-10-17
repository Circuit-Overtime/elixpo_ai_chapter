import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyticsClient } from '../src/api/AnalyticsClient.js';

function response(data = [], meta = {}) {
  return new Response(JSON.stringify({ data, meta }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('personal analytics requires only the read-only analytics scope', async () => {
  const scopes = [];
  const paths = [];
  const client = new AnalyticsClient({
    requireScopes: async (value) => scopes.push(value),
    request: async (path) => { paths.push(path); return response({ values: [] }); },
  });
  await client.query({ range: '30d', dimension: 'overview' });
  assert.deepEqual(scopes, [['lixblogs:analytics:read']]);
  assert.match(paths[0], /scope=personal/);
});

test('organization analytics additionally requires org read scope', async () => {
  let required;
  const client = new AnalyticsClient({
    requireScopes: async (value) => { required = value; },
    request: async () => response({ values: [] }),
  });
  await client.query({ scope: 'org:o1', range: 'custom', from: '2026-07-01', to: '2026-07-31', dimension: 'posts', limit: 10, cursor: 'MTA=' });
  assert.deepEqual(required, ['lixblogs:analytics:read', 'lixblogs:organizations:read']);
});

test('authorization failures retain machine-readable API errors', async () => {
  const client = new AnalyticsClient({
    requireScopes: async () => {},
    request: async () => new Response(JSON.stringify({ error: { code: 'forbidden_scope', message: 'Not authorized.', requestId: 'req-1' } }), { status: 403 }),
  });
  await assert.rejects(client.query(), (error) => error.code === 'forbidden_scope' && error.requestId === 'req-1');
});
