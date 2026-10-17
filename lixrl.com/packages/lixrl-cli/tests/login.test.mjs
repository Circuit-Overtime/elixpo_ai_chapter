import assert from 'node:assert/strict';
import test from 'node:test';
import { findValidLocalLogin } from '../src/login.js';

const credentials = (key) => ({ get: async () => key });

test('login reuses a valid local profile without starting device authorization', async () => {
  const calls = [];
  class Client {
    constructor(options) {
      calls.push(options);
    }

    async me() {
      return { email: 'user@example.com', tier: 'free' };
    }
  }
  const result = await findValidLocalLogin({
    credentials: credentials(`elu_${'a'.repeat(24)}`),
    profile: 'default',
    apiUrl: 'https://lixrl.com',
    Client,
  });
  assert.equal(result.user.email, 'user@example.com');
  assert.equal(calls.length, 1);
});

test('forced login and direct-key login skip local-profile reuse', async () => {
  const store = credentials(`elu_${'a'.repeat(24)}`);
  assert.equal(await findValidLocalLogin({
    credentials: store,
    profile: 'default',
    apiUrl: 'https://lixrl.com',
    force: true,
  }), null);
  assert.equal(await findValidLocalLogin({
    credentials: store,
    profile: 'default',
    apiUrl: 'https://lixrl.com',
    directKeyLogin: true,
  }), null);
});

test('an invalid stored key falls through to device login', async () => {
  class Client {
    async me() {
      throw Object.assign(new Error('Unauthorized'), { code: 'login_required' });
    }
  }
  assert.equal(await findValidLocalLogin({
    credentials: credentials(`elu_${'a'.repeat(24)}`),
    profile: 'default',
    apiUrl: 'https://lixrl.com',
    Client,
  }), null);
});
