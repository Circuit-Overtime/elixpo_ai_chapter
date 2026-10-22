import test from 'node:test';
import assert from 'node:assert/strict';
import { CollaborationClient } from '../src/api/CollaborationClient.js';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('collaboration reads require the read scope and stay under API v1', async () => {
  const requests = [];
  const scopes = [];
  const client = new CollaborationClient({
    requireScopes: async (value) => scopes.push(value),
    request: async (path) => { requests.push(path); return response({ data: [] }); },
  });
  await client.invitations();
  await client.list('blog 1');
  assert.deepEqual(scopes, [['lixblogs:collaboration:read'], ['lixblogs:collaboration:read']]);
  assert.deepEqual(requests, ['/api/v1/collaboration/invitations', '/api/v1/blogs/blog%201/collaborators']);
});

test('collaboration mutations carry explicit bodies and idempotency keys', async () => {
  const requests = [];
  const client = new CollaborationClient({
    requireScopes: async () => {},
    request: async (path, options) => { requests.push({ path, options }); return response({ data: { ok: true } }); },
  });
  await client.invite('blog-1', { user: 'reviewer', role: 'viewer', idempotencyKey: 'invite-1' });
  await client.resolveInvitation('blog-1', { action: 'accept', showOnProfile: false, idempotencyKey: 'accept-1' });
  assert.equal(requests[0].options.headers['idempotency-key'], 'invite-1');
  assert.deepEqual(JSON.parse(requests[0].options.body), { user: 'reviewer', role: 'viewer' });
  assert.equal(requests[1].options.headers['idempotency-key'], 'accept-1');
  assert.equal(JSON.parse(requests[1].options.body).showOnProfile, false);
});
