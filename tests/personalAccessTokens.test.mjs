import assert from 'node:assert/strict';
import test from 'node:test';

import { requireBearerAuth } from '../lib/api/v1/bearerAuth.js';
import {
  createPersonalAccessToken,
  credentialAllowsPublishedAs,
} from '../lib/api/v1/personalAccessTokens.js';

function tokenDatabase() {
  let stored = null;
  return {
    get stored() { return stored; },
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes('INSERT INTO api_personal_access_tokens')) {
                stored = {
                  id: values[0], user_id: values[1], name: values[2], token_prefix: values[3],
                  token_hash: values[4], scopes: values[5], resource_type: values[6],
                  organization_id: values[7], expires_at: values[8], created_at: values[9],
                  last_used_at: null, revoked_at: null,
                };
              }
              if (sql.includes('SET last_used_at')) stored.last_used_at = values[0];
              return { meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes('FROM api_personal_access_tokens')) return stored;
              return null;
            },
          };
        },
      };
    },
  };
}

test('creates a one-time PAT while persisting only its hash', async () => {
  const db = tokenDatabase();
  const created = await createPersonalAccessToken(db, 'user-1', {
    name: 'Release workflow',
    scopes: ['lixblogs:blog:read', 'lixblogs:blog:write'],
    expiryDays: 30,
  });

  assert.match(created.token, /^lix_pat_[A-Za-z0-9_-]+$/);
  assert.equal(db.stored.token_hash.length, 64);
  assert.notEqual(db.stored.token_hash, created.token);
  assert.equal(JSON.stringify(db.stored).includes(created.token), false);
});

test('authenticates PATs and enforces their operation scopes', async () => {
  const db = tokenDatabase();
  const created = await createPersonalAccessToken(db, 'user-1', {
    name: 'Read workflow',
    scopes: ['lixblogs:blog:read'],
  });
  const request = new Request('https://blogs.elixpo.com/api/v1/blogs', {
    headers: { authorization: `Bearer ${created.token}` },
  });
  const auth = await requireBearerAuth(request, ['lixblogs:blog:read'], { db });
  assert.equal(auth.userId, 'user-1');
  assert.equal(auth.credentialType, 'pat');
  assert.equal(auth.resourceType, 'personal');

  await assert.rejects(
    requireBearerAuth(request, ['lixblogs:blog:publish'], { db }),
    (error) => error.code === 'insufficient_scope',
  );
});

test('rejects a revoked PAT on the next request without an authorization cache', async () => {
  const db = tokenDatabase();
  const created = await createPersonalAccessToken(db, 'user-1', {
    name: 'Deploy workflow',
    scopes: ['lixblogs:blog:read'],
  });
  const request = new Request('https://blogs.elixpo.com/api/v1/blogs', {
    headers: { authorization: `Bearer ${created.token}` },
  });

  await requireBearerAuth(request, ['lixblogs:blog:read'], { db });
  db.stored.revoked_at = Math.floor(Date.now() / 1000);

  await assert.rejects(
    requireBearerAuth(request, ['lixblogs:blog:read'], { db }),
    (error) => error.code === 'invalid_token' && /revoked/.test(error.message),
  );
});

test('keeps personal and organization publication grants isolated', () => {
  const personal = { credentialType: 'pat', resourceType: 'personal', userId: 'user-1' };
  const organization = { credentialType: 'pat', resourceType: 'organization', organizationId: 'org-1' };
  assert.equal(credentialAllowsPublishedAs(personal, 'personal'), true);
  assert.equal(credentialAllowsPublishedAs(personal, 'org:org-1'), false);
  assert.equal(credentialAllowsPublishedAs(organization, 'org:org-1'), true);
  assert.equal(credentialAllowsPublishedAs(organization, 'org:org-2'), false);
});
