import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudinaryDisconnect } from '../src/commands/integrations/cloudinary-disconnect.js';
import { cloudinaryStatus } from '../src/commands/integrations/cloudinary-status.js';

test('Cloudinary disconnect fails closed before making a request', async () => {
  const integrationsClient = {
    cloudinaryDisconnect: async () => assert.fail('must not disconnect without confirmation'),
  };
  const result = await cloudinaryDisconnect({ integrationsClient, confirmed: false });
  assert.equal(result.ok, false);
  assert.match(result.reason, /explicit confirmation/);
});

test('Cloudinary status returns connection data', async () => {
  const data = { connected: true, cloudName: 'creator-space', mediaCount: 2, trackedBytes: 1024 };
  assert.deepEqual(
    await cloudinaryStatus({ integrationsClient: { cloudinaryStatus: async () => data } }),
    { ok: true, data },
  );
});

test('Cloudinary command failures preserve structured errors', async () => {
  const error = Object.assign(new Error('Delete stored media first.'), {
    code: 'media_still_stored', status: 409, requestId: 'req-1',
  });
  const result = await cloudinaryDisconnect({
    integrationsClient: { cloudinaryDisconnect: async () => { throw error; } },
    confirmed: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
});
