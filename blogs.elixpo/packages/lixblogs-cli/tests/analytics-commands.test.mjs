import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsQuery } from '../src/commands/analytics/index.js';

test('custom ranges are passed explicitly and empty datasets remain valid', async () => {
  let received;
  const client = { query: async (options) => { received = options; return { data: { values: [] }, meta: { hasMore: false, nextCursor: null } }; } };
  const result = await analyticsQuery({ client, options: { range: 'custom', from: '2026-07-01', to: '2026-07-31', dimension: 'countries', limit: 50 } });
  assert.equal(received.from, '2026-07-01');
  assert.equal(received.to, '2026-07-31');
  assert.deepEqual(result.data.values, []);
});

test('custom ranges fail before an API request when a boundary is absent', async () => {
  await assert.rejects(
    analyticsQuery({ client: { query: async () => assert.fail('must not call API') }, options: { range: 'custom', from: '2026-07-01' } }),
    /require --from and --to/,
  );
});
