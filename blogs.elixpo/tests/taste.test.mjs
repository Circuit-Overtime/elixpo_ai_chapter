import assert from 'node:assert/strict';
import test from 'node:test';
import { getSearchSuggestions, recordSignal } from '../lib/taste.js';

function mockDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        bind: (...values) => ({
          all: async () => ({ results: [] }),
          run: async () => {
            calls.push(values);
            return {};
          },
        }),
      };
    },
  };
}

test('dwell signals with bad durations are dropped', async () => {
  for (const bad of ['oops', NaN, Infinity, undefined]) {
    const db = mockDb();
    await recordSignal(db, 'u1', 'dwell', { blogId: null, tag: 'ai', dwellSeconds: bad });
    assert.equal(db.calls.filter((c) => Array.isArray(c)).length, 0, `no insert for ${String(bad)}`);
  }
});

test('valid dwell signals still record scaled weight', async () => {
  const db = mockDb();
  await recordSignal(db, 'u1', 'dwell', { blogId: null, tag: 'ai', dwellSeconds: 90 });
  const inserts = db.calls.filter((c) => Array.isArray(c));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][4], 1.5);
});

test('suggestion prefixes are escaped and lowercased', async () => {
  const seen = [];
  const db = {
    prepare(sql) {
      return {
        bind: (...values) => ({
          all: async () => {
            seen.push({ sql, values });
            return { results: [] };
          },
        }),
      };
    },
  };
  await getSearchSuggestions(db, 'u1', '%', 8);
  assert.ok(seen[0].values[1] === '\\%%', 'wildcard input stays literal');
  assert.match(seen[0].sql, /ESCAPE/);
  await getSearchSuggestions(db, 'u1', 'AI', 8);
  assert.ok(seen[2].values[1] === 'ai%', 'recent branch lowercases like popular');
});
