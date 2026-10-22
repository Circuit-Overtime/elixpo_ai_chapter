import assert from 'node:assert/strict';
import test from 'node:test';

import { contestCreate, contestDelete, contestEdit } from '../src/commands/contest/index.js';

const required = {
  title: 'Open web',
  'starts-at': '2026-10-01T00:00:00Z',
  'submissions-close-at': '2026-10-15T00:00:00Z',
  'judging-closes-at': '2026-10-20T00:00:00Z',
};

test('contest creation forwards eligibility controls', async () => {
  let input;
  await contestCreate({
    client: { create: async (value) => { input = value; return value; } },
    options: { ...required, limit: '5', 'contest-tag': ['community'], 'minimum-account-age-months': '1', 'require-bio': true, 'eligible-user': ['writer-one', 'writer-two'] },
  });
  assert.deepEqual(input.eligibility, {
    minimumAccountAgeMonths: 1,
    requireBio: true,
    allowedUsernames: ['writer-one', 'writer-two'],
  });
  assert.equal(input.perAuthorLimit, 5);
  assert.deepEqual(input.tags, ['community']);
});

test('contest entry limits and account months reject invalid values', () => {
  assert.throws(() => contestCreate({ client: {}, options: { ...required, limit: '6' } }), /between 1 and 5/);
  assert.throws(() => contestCreate({ client: {}, options: { ...required, 'minimum-account-age-months': '1.5' } }), /whole number/);
});

test('contest editing can clear the invited-author restriction', async () => {
  let input;
  await contestEdit({
    client: { update: async (_id, value) => { input = value; return value; } },
    id: 'contest-1',
    options: { 'clear-eligible-users': true },
  });
  assert.deepEqual(input, { eligibility: { allowedUsernames: [] } });
});

test('contest draft deletion requires explicit confirmation', async () => {
  assert.throws(() => contestDelete({ client: {}, id: 'contest-1', options: {} }), /requires --yes/);
  let deleted;
  await contestDelete({ client: { delete: async (id) => { deleted = id; } }, id: 'contest-1', options: { yes: true } });
  assert.equal(deleted, 'contest-1');
});
