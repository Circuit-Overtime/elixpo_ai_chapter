import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { requireBearerAuth, verifyAccessToken } from '../lib/api/v1/bearerAuth.js';

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function fixture(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'EdDSA', typ: 'JWT' });
  const payload = base64url({
    sub: 'user-1',
    type: 'access',
    client_id: 'lixblogs-cli-prod',
    aud: 'blogs.elixpo.com',
    scopes: ['lixblogs:blog:read'],
    iat: now,
    exp: now + 300,
    ...overrides,
  });
  const input = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(input), privateKey).toString('base64url');
  return {
    token: `${input}.${signature}`,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

test('accepts a locally verified Accounts access token for the CLI audience', async () => {
  const { token, publicKeyPem } = fixture();
  const auth = await verifyAccessToken(token, { publicKeyPem });
  assert.deepEqual(auth, {
    userId: 'user-1',
    clientId: 'lixblogs-cli-prod',
    sessionId: null,
    scopes: ['lixblogs:blog:read'],
    expiresAt: auth.expiresAt,
  });
});

test('rejects expired, wrong-audience, and unapproved-client tokens', async () => {
  const expired = fixture({ exp: Math.floor(Date.now() / 1000) - 1 });
  await assert.rejects(
    verifyAccessToken(expired.token, { publicKeyPem: expired.publicKeyPem }),
    (error) => error.code === 'token_expired',
  );

  const wrongAudience = fixture({ aud: 'accounts.elixpo.com' });
  await assert.rejects(
    verifyAccessToken(wrongAudience.token, { publicKeyPem: wrongAudience.publicKeyPem }),
    (error) => error.code === 'invalid_audience',
  );

  const wrongClient = fixture({ client_id: 'unknown-client' });
  await assert.rejects(
    verifyAccessToken(wrongClient.token, { publicKeyPem: wrongClient.publicKeyPem }),
    (error) => error.code === 'invalid_client',
  );
});

test('enforces operation scopes without leaking bearer material', async () => {
  const { token, publicKeyPem } = fixture({ scopes: ['lixblogs:blog:read'] });
  const request = new Request('https://blogs.elixpo.com/api/v1/blogs', {
    headers: { authorization: `Bearer ${token}` },
  });
  await assert.rejects(
    requireBearerAuth(request, ['lixblogs:blog:write'], { publicKeyPem }),
    (error) => {
      assert.equal(error.code, 'insufficient_scope');
      assert.doesNotMatch(error.message, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('rejects malformed authorization headers before token verification', async () => {
  await assert.rejects(
    requireBearerAuth(new Request('https://blogs.elixpo.com/api/v1/blogs')),
    (error) => error.code === 'missing_token',
  );
});
