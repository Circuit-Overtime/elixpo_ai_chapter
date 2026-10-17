import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountsDeviceAuth,
  fetchLixrlCliConfig,
  pollLixrlAuthorization,
  startLixrlAuthorization,
} from '../src/device-auth.js';

const discovery = {
  issuer: 'https://accounts.elixpo.com',
  device_authorization_endpoint: 'https://accounts.elixpo.com/api/auth/device/authorize',
  token_endpoint: 'https://accounts.elixpo.com/api/auth/token',
  revocation_endpoint: 'https://accounts.elixpo.com/api/auth/revoke',
  scopes_supported: ['openid', 'profile', 'email', 'lixrl:keys:create'],
  grant_types_supported: ['urn:ietf:params:oauth:grant-type:device_code'],
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('device login requests the registered Lixrl audience and identity scopes', async () => {
  const calls = [];
  const queue = [
    response(discovery),
    response({
      device_code: 'device-secret',
      user_code: 'LIXR-L123',
      verification_uri: 'https://accounts.elixpo.com/device',
      verification_uri_complete: 'https://accounts.elixpo.com/device?user_code=LIXR-L123',
      expires_in: 600,
      interval: 5,
    }),
  ];
  const auth = new AccountsDeviceAuth({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return queue.shift();
    },
  });
  const challenge = await auth.requestDeviceCode();
  assert.equal(challenge.userCode, 'LIXR-L123');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.client_id, 'lixrl-cli-prod');
  assert.equal(body.audience, 'lixrl.com');
  assert.equal(body.scope, 'openid profile email lixrl:keys:create');
});

test('device login accepts a configured Accounts client identifier', async () => {
  const calls = [];
  const queue = [
    response(discovery),
    response({
      device_code: 'device-secret',
      user_code: 'LIXR-L123',
      verification_uri: 'https://accounts.elixpo.com/device',
      expires_in: 600,
      interval: 5,
    }),
  ];
  const auth = new AccountsDeviceAuth({
    env: { ELIXPO_LIXRL_CLI_CLIENT_ID: 'lixrl-cli-staging' },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return queue.shift();
    },
  });
  await auth.requestDeviceCode();
  assert.equal(JSON.parse(calls[1].options.body).client_id, 'lixrl-cli-staging');
});

test('device login discovers its public OAuth configuration from Lixrl', async () => {
  const result = await fetchLixrlCliConfig({
    apiUrl: 'https://lixrl.com',
    fetchImpl: async (url) => {
      assert.equal(String(url), 'https://lixrl.com/api/cli/config');
      return response({
        client_id: 'registered-client-id',
        accounts_origin: 'https://accounts.elixpo.com',
        audience: 'lixrl.com',
      });
    },
  });
  assert.deepEqual(result, {
    clientId: 'registered-client-id',
    accountsUrl: 'https://accounts.elixpo.com',
    audience: 'lixrl.com',
  });
});

test('Accounts discovery retries a transient network failure', async () => {
  let calls = 0;
  const auth = new AccountsDeviceAuth({
    retries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return response(discovery);
    },
  });
  assert.equal((await auth.discover()).issuer, 'https://accounts.elixpo.com');
  assert.equal(calls, 2);
});

test('Accounts discovery reports network failures without a misleading outage message', async () => {
  const auth = new AccountsDeviceAuth({
    retries: 1,
    sleep: async () => {},
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  await assert.rejects(
    () => auth.discover(),
    (error) => error.code === 'accounts_unreachable' && /network, DNS, or TLS/.test(error.message),
  );
});

test('Accounts discovery identifies incompatible metadata', async () => {
  const auth = new AccountsDeviceAuth({ fetchImpl: async () => response({ ...discovery, issuer: 'https://invalid.example' }) });
  await assert.rejects(
    () => auth.discover(),
    (error) => error.code === 'invalid_accounts_metadata' && /incompatible/.test(error.message),
  );
});

test('Lixrl login configuration retries a transient server failure', async () => {
  let calls = 0;
  const result = await fetchLixrlCliConfig({
    apiUrl: 'https://lixrl.com',
    retries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response({ error: 'busy' }, 503);
      return response({
        client_id: 'registered-client-id',
        accounts_origin: 'https://accounts.elixpo.com',
        audience: 'lixrl.com',
      });
    },
  });
  assert.equal(result.clientId, 'registered-client-id');
  assert.equal(calls, 2);
});

test('device polling keeps pending responses separate from returned tokens', async () => {
  const queue = [
    response(discovery),
    response({ error: 'authorization_pending' }, 400),
    response({ access_token: 'access-secret', refresh_token: 'refresh-secret' }),
  ];
  const auth = new AccountsDeviceAuth({ fetchImpl: async () => queue.shift() });
  assert.deepEqual(await auth.poll('device-secret'), { status: 'pending' });
  assert.deepEqual(await auth.poll('device-secret'), {
    status: 'approved',
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
  });
});

test('Lixrl authorization start sends the short-lived Accounts token only once', async () => {
  const calls = [];
  const result = await startLixrlAuthorization({
    apiUrl: 'https://lixrl.com',
    accessToken: 'accounts-access-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response({
        request_id: 'request-id',
        poll_secret: 'poll-secret',
        approval_url: 'https://lixrl.com/cli/authorize?request=request-id',
        expires_in: 600,
        interval: 3,
      }, 201);
    },
  });
  assert.equal(result.requestId, 'request-id');
  assert.equal(calls[0].url, 'https://lixrl.com/api/cli/auth/requests');
  assert.equal(calls[0].options.headers.authorization, 'Bearer accounts-access-token');
  assert.equal(calls[0].options.body, undefined);
});

test('Lixrl polling exchanges the secret for the approved API key', async () => {
  const calls = [];
  const result = await pollLixrlAuthorization({
    apiUrl: 'https://lixrl.com',
    requestId: 'request-id',
    pollSecret: 'poll-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response({ status: 'approved', key: `elu_${'a'.repeat(32)}` });
    },
  });
  assert.match(result.key, /^elu_/);
  assert.equal(calls[0].url, 'https://lixrl.com/api/cli/auth/requests/request-id/token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { poll_secret: 'poll-secret' });
});
