import test from 'node:test';
import assert from 'node:assert/strict';
import { collabAccept, collabInvite, collabRemove } from '../src/commands/collab/index.js';

test('collaboration mutations fail closed without approval', async () => {
  await assert.rejects(
    collabInvite({ client: {}, id: 'blog-1', options: { user: 'alex', role: 'viewer' } }),
    (error) => error.code === 'confirmation_required',
  );
  await assert.rejects(
    collabRemove({ client: {}, id: 'blog-1', options: {} }),
    (error) => error.code === 'confirmation_required',
  );
});

test('accept passes explicit profile visibility', async () => {
  let request;
  const client = { resolveInvitation: async (id, options) => { request = { id, options }; return { status: 'accepted' }; } };
  const result = await collabAccept({ client, id: 'blog-1', options: { yes: true, 'hide-on-profile': true } });
  assert.equal(result.status, 'accepted');
  assert.equal(request.options.showOnProfile, false);
});

test('dry-run validates invitation without sending it', async () => {
  let called = false;
  const result = await collabInvite({
    client: { invite: async () => { called = true; } },
    id: 'blog-1',
    options: { user: 'alex', role: 'viewer', 'dry-run': true },
  });
  assert.equal(called, false);
  assert.equal(result.dryRun, true);
});
