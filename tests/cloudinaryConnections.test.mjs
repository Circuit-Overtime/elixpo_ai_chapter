import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCloudinaryUrl } from '../lib/cloudinaryConnections.js';
import { decryptIntegrationSecret, encryptIntegrationSecret } from '../lib/integrationSecrets.js';
import {
  buildCloudinaryAuthorizationUrl,
  isValidCloudinaryCloudName,
  resolveCloudinaryCloudName,
  tokenExpiry,
} from '../lib/cloudinaryOAuth.js';
import { deleteFromCloudinary, uploadToCloudinary } from '../lib/cloudinary.js';

test('Cloudinary environment URLs are parsed without exposing alternate schemes', () => {
  assert.deepEqual(
    parseCloudinaryUrl('cloudinary://12345:s3cr%40t@creator-cloud'),
    { cloudName: 'creator-cloud', apiKey: '12345', apiSecret: 's3cr@t' },
  );
  assert.throws(() => parseCloudinaryUrl('https://12345:secret@creator-cloud'), /Cloudinary URL/);
  assert.throws(() => parseCloudinaryUrl('cloudinary://creator-cloud'), /API key/);
});

test('integration secrets round-trip through authenticated encryption', async () => {
  const previous = process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY;
  process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY = 'test-only-connection-key';
  try {
    const encrypted = await encryptIntegrationSecret('creator-secret');
    assert.match(encrypted, /^v1\./);
    assert.equal(encrypted.includes('creator-secret'), false);
    assert.equal(await decryptIntegrationSecret(encrypted), 'creator-secret');
  } finally {
    if (previous === undefined) delete process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY;
    else process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY = previous;
  }
});

test('Cloudinary OAuth authorization uses the registered callback and least scopes', () => {
  const oldId = process.env.CLOUDINARY_OAUTH_CLIENT_ID;
  const oldSecret = process.env.CLOUDINARY_OAUTH_CLIENT_SECRET;
  process.env.CLOUDINARY_OAUTH_CLIENT_ID = 'client-id';
  process.env.CLOUDINARY_OAUTH_CLIENT_SECRET = 'client-secret';
  try {
    const url = new URL(buildCloudinaryAuthorizationUrl({
      origin: 'https://blogs.elixpo.com',
      state: 'csrf-state',
    }));
    assert.equal(url.origin, 'https://oauth.cloudinary.com');
    assert.equal(url.pathname, '/oauth2/auth');
    assert.equal(url.searchParams.get('client_id'), 'client-id');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://blogs.elixpo.com/api/integrations/cloudinary/callback');
    assert.equal(url.searchParams.get('scope'), 'openid offline_access asset_management upload');
    assert.equal(url.searchParams.get('state'), 'csrf-state');
  } finally {
    if (oldId === undefined) delete process.env.CLOUDINARY_OAUTH_CLIENT_ID;
    else process.env.CLOUDINARY_OAUTH_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.CLOUDINARY_OAUTH_CLIENT_SECRET;
    else process.env.CLOUDINARY_OAUTH_CLIENT_SECRET = oldSecret;
  }
});

test('Cloudinary OAuth resolves product environments and conservative expiry', async () => {
  assert.equal(
    await resolveCloudinaryCloudName({ cloud_name: 'creator-cloud', access_token: 'opaque' }),
    'creator-cloud',
  );
  assert.equal(tokenExpiry(300, 1000), 1300);
  assert.equal(tokenExpiry(undefined, 1000), 1300);
});

test('Cloudinary OAuth accepts safe product-environment cloud names', () => {
  assert.equal(isValidCloudinaryCloudName('creator-cloud'), true);
  assert.equal(isValidCloudinaryCloudName('creator_cloud_2'), true);
  assert.equal(isValidCloudinaryCloudName('2creator'), true);
  assert.equal(isValidCloudinaryCloudName('../creator'), false);
  assert.equal(isValidCloudinaryCloudName('creator/cloud'), false);
});

test('Cloudinary OAuth resolves the official ext.cloud_name access-token claim', async () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'none' })}.${encode({
    ext: { cloud_name: 'selected-product-environment' },
  })}.signature`;

  assert.equal(
    await resolveCloudinaryCloudName({ access_token: accessToken }),
    'selected-product-environment',
  );
});

test('Cloudinary media operations authenticate OAuth connections with bearer tokens', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ public_id: 'lixblogs/test/image', secure_url: 'https://example.test/image' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const config = { cloudName: 'creator-cloud', oauthToken: 'access-token' };
    await uploadToCloudinary(new Uint8Array([1, 2, 3]), {
      folder: 'lixblogs/test',
      publicId: 'image',
      mimeType: 'image/webp',
      config,
    });
    await deleteFromCloudinary('lixblogs/test/image', { config });
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.options.headers.Authorization, 'Bearer access-token');
      assert.match(request.url, /\/v1_1\/creator-cloud\/image\//);
      assert.equal(request.options.body.has('api_key'), false);
      assert.equal(request.options.body.has('signature'), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
