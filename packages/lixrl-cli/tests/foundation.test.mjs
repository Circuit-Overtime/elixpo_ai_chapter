import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveConfig, ProfileRegistry, validateProfile } from '../src/config.js';
import { CredentialStore } from '../src/credentials.js';
import { LixrlClient, ApiError } from '../src/client.js';
import { safeJson } from '../src/contract.js';

test('config defaults to the production Lixrl origin', () => {
  assert.equal(resolveConfig({ env: {} }).apiUrl, 'https://lixrl.com');
  assert.throws(() => resolveConfig({ options: { 'api-url': 'http://example.com' }, env: {} }), /HTTPS/);
  assert.equal(validateProfile('team-prod'), 'team-prod');
  assert.throws(() => validateProfile('../secret'), /Profile names/);
});

test('profile registry stores no credentials', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shortner-profile-'));
  const file = path.join(root, 'config.json');
  const registry = new ProfileRegistry({ file });
  await registry.add('work');
  await registry.add('personal');
  await registry.use('work');
  assert.deepEqual(await registry.read(), { active: 'work', profiles: ['personal', 'work'] });
  assert.doesNotMatch(await readFile(file, 'utf8'), /elu_/);
});

test('credential store prefers the process environment without touching keychain', async () => {
  const store = new CredentialStore({ keyringModule: { Entry: class { constructor() { throw new Error('must not load'); } } } });
  assert.equal(await store.get('default', { LIXRL_API_KEY: `elu_${'a'.repeat(24)}` }), `elu_${'a'.repeat(24)}`);
});

test('client limits requests to the configured API and reports JSON errors', async () => {
  const calls = [];
  const client = new LixrlClient({
    apiUrl: 'https://lixrl.com',
    apiKey: `elu_${'a'.repeat(24)}`,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ email: 'user@example.com' }), { headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal((await client.me()).email, 'user@example.com');
  assert.match(calls[0].options.headers.authorization, /^Bearer elu_/);
  await assert.rejects(() => client.request('https://evil.example/api/urls'), ApiError);
});

test('client preserves actionable API error codes and details', async () => {
  const client = new LixrlClient({
    apiUrl: 'https://lixrl.com',
    apiKey: `elu_${'a'.repeat(24)}`,
    fetchImpl: async () => new Response(JSON.stringify({
      error: 'API key limit reached (1 for free tier)',
      code: 'api_key_limit_reached',
      limit: 1,
      tier: 'free',
    }), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(
    () => client.request('/api/keys', { method: 'POST', body: { name: 'CLI' } }),
    (error) => error.code === 'api_key_limit_reached' && error.details.limit === 1,
  );
});

test('JSON output redacts credential-shaped fields', () => {
  assert.doesNotMatch(safeJson({ apiKey: `elu_${'a'.repeat(24)}`, nested: { token: 'secret' } }), /elu_|secret/);
});
