import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeMcpWorkspace, createMcpGrantToken, hashMcpGrantToken, readBearerToken } from '../../../src/lib/mcpGrants.js';

test('workspace grant tokens are prefixed, random, and hash deterministically', async () => {
  const first = createMcpGrantToken();
  const second = createMcpGrantToken();
  assert.match(first, /^lixmcp_[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(await hashMcpGrantToken(first), await hashMcpGrantToken(first));
  assert.notEqual(await hashMcpGrantToken(first), first);
  assert.equal(await hashMcpGrantToken('invalid'), null);
});

test('workspace authorization hashes bearer credentials and enforces read-only grants', async () => {
  const token = createMcpGrantToken();
  const expectedHash = await hashMcpGrantToken(token);
  let bindings;
  const DB = {
    prepare: (sql) => ({
      bind: (...values) => ({
        first: async () => {
          bindings = { sql, values };
          return { id: 'grant-1', permission: 'read', session_id: 'lx-test', created_by: 'user-1' };
        },
      }),
    }),
  };
  const request = new Request('https://example.test', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(readBearerToken(request), token);
  const read = await authorizeMcpWorkspace(DB, request, 'lx-test', 'read');
  assert.equal(read.forbidden, false);
  assert.equal(bindings.values[0], expectedHash);
  assert.match(bindings.sql, /g\.user_id = s\.created_by/);
  const edit = await authorizeMcpWorkspace(DB, request, 'lx-test', 'edit');
  assert.equal(edit.forbidden, true);
});
