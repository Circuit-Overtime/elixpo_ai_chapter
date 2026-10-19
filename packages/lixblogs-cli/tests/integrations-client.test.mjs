import assert from 'node:assert/strict';
import test from 'node:test';
import { IntegrationsClient } from '../src/api/IntegrationsClient.js';

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-header' },
  });
}

test('Cloudinary integration operations require their canonical scopes and API v1 route', async () => {
  const scopes = [];
  const requests = [];
  const client = new IntegrationsClient({
    requireScopes: async (required) => scopes.push(required),
    request: async (path, options = {}) => {
      requests.push({ path, method: options.method || 'GET' });
      return response({ data: { connected: options.method !== 'DELETE' } });
    },
  });

  await client.cloudinaryStatus();
  await client.cloudinaryDisconnect();

  assert.deepEqual(scopes, [
    ['lixblogs:integrations:cloudinary:read'],
    ['lixblogs:integrations:cloudinary:disconnect'],
  ]);
  assert.deepEqual(requests, [
    { path: '/api/v1/integrations/cloudinary', method: 'GET' },
    { path: '/api/v1/integrations/cloudinary', method: 'DELETE' },
  ]);
});

test('Cloudinary API errors retain code, request id, and status for machine output', async () => {
  const client = new IntegrationsClient({
    requireScopes: async () => {},
    request: async () => response({
      error: { code: 'media_still_stored', message: 'Delete stored media first.', requestId: 'req-body' },
    }, 409),
  });

  await assert.rejects(client.cloudinaryDisconnect(), (error) => {
    assert.equal(error.code, 'media_still_stored');
    assert.equal(error.status, 409);
    assert.equal(error.requestId, 'req-body');
    return true;
  });
});
