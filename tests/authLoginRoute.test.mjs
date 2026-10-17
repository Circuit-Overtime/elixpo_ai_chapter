import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOAuthAuthorizeUrl } from '../lib/oauthAuthorize.js';

const CLIENT_ID = 'test-client-id';

test('OAuth login URL construction fails when the client ID is missing', () => {
  assert.throws(() => buildOAuthAuthorizeUrl({
    origin: 'https://blogs.elixpo.com',
    state: 'state-1',
    config: {
      authorizeUrl: 'https://accounts.elixpo.com/oauth/authorize',
      scope: 'openid profile email',
    },
  }), /oauth_not_configured/);
});

test('OAuth login URL contains every required authorization parameter', () => {
  const location = new URL(buildOAuthAuthorizeUrl({
    origin: 'https://blogs.elixpo.com',
    state: 'state-1',
    config: {
      authorizeUrl: 'https://accounts.elixpo.com/oauth/authorize',
      clientId: CLIENT_ID,
      scope: 'openid profile email',
    },
  }));

  assert.equal(location.origin, 'https://accounts.elixpo.com');
  assert.equal(location.pathname, '/oauth/authorize');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(location.searchParams.get('redirect_uri'), 'https://blogs.elixpo.com/api/auth/callback');
  assert.equal(location.searchParams.get('state'), 'state-1');
});
