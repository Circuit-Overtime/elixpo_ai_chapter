import test from 'node:test';
import assert from 'node:assert/strict';
import { claimAIQuota, utcDay } from '../lib/aiQuota.js';

// Run the real SQL against SQLite (the engine behind D1). node:sqlite ships
// with Node 22+; skip rather than fail on runtimes that do not have it.
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // handled by the skip flag below
}
const skip = !DatabaseSync && 'node:sqlite is not available on this runtime';

const TODAY = '2026-10-02';

// Minimal D1-shaped adapter. Every call yields to the event loop first, so
// concurrent requests genuinely interleave the way parallel edge isolates do;
// each individual statement still executes atomically, as it does in D1.
function d1(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              await new Promise((resolve) => setImmediate(resolve));
              const info = sqlite.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
            async first() {
              await new Promise((resolve) => setImmediate(resolve));
              return sqlite.prepare(sql).get(...params) ?? null;
            },
          };
        },
      };
    },
  };
}

function setup(users = [{ id: 'u1' }]) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      ai_usage_today INTEGER NOT NULL DEFAULT 0,
      ai_usage_date TEXT
    )
  `);
  const insert = sqlite.prepare('INSERT INTO users (id, ai_usage_today, ai_usage_date) VALUES (?, ?, ?)');
  for (const user of users) insert.run(user.id, user.usage ?? 0, user.date ?? null);
  return { sqlite, db: d1(sqlite) };
}

// node:sqlite rows have a null prototype; copy into a plain object for deepEqual.
const usage = (sqlite, id) => ({ ...sqlite.prepare('SELECT ai_usage_today AS n, ai_usage_date AS d FROM users WHERE id = ?').get(id) });

test('parallel requests can never exceed the daily limit', { skip }, async () => {
  const { sqlite, db } = setup([{ id: 'u1', usage: 14, date: TODAY }]);
  const results = await Promise.all(Array.from({ length: 40 }, () => claimAIQuota(db, 'u1', 15, TODAY)));

  assert.equal(results.filter(Boolean).length, 1, 'only the single remaining request may be admitted');
  assert.equal(usage(sqlite, 'u1').n, 15);
});

test('a burst from zero admits exactly the limit and counts every admitted request', { skip }, async () => {
  const { sqlite, db } = setup();
  const results = await Promise.all(Array.from({ length: 60 }, () => claimAIQuota(db, 'u1', 15, TODAY)));

  assert.equal(results.filter(Boolean).length, 15);
  assert.deepEqual(usage(sqlite, 'u1'), { n: 15, d: TODAY });
});

test('a new UTC day resets the counter', { skip }, async () => {
  const { sqlite, db } = setup([{ id: 'u1', usage: 15, date: '2026-10-01' }]);

  assert.equal(await claimAIQuota(db, 'u1', 15, TODAY), true);
  assert.deepEqual(usage(sqlite, 'u1'), { n: 1, d: TODAY });
});

test('an exhausted allowance is refused without changing the counter', { skip }, async () => {
  const { sqlite, db } = setup([{ id: 'u1', usage: 50, date: TODAY }]);

  assert.equal(await claimAIQuota(db, 'u1', 50, TODAY), false);
  assert.deepEqual(usage(sqlite, 'u1'), { n: 50, d: TODAY });
});

test('a user who has never used AI starts from a NULL date', { skip }, async () => {
  const { sqlite, db } = setup([{ id: 'u1', usage: 0, date: null }]);

  assert.equal(await claimAIQuota(db, 'u1', 15, TODAY), true);
  assert.deepEqual(usage(sqlite, 'u1'), { n: 1, d: TODAY });
});

test('allowances are tracked per user', { skip }, async () => {
  const { sqlite, db } = setup([{ id: 'a' }, { id: 'b' }]);
  const results = await Promise.all([
    ...Array.from({ length: 10 }, () => claimAIQuota(db, 'a', 3, TODAY)),
    ...Array.from({ length: 10 }, () => claimAIQuota(db, 'b', 3, TODAY)),
  ]);

  assert.equal(results.filter(Boolean).length, 6);
  assert.equal(usage(sqlite, 'a').n, 3);
  assert.equal(usage(sqlite, 'b').n, 3);
});

test('unknown users and zero limits are refused', { skip }, async () => {
  const { db } = setup();

  assert.equal(await claimAIQuota(db, 'missing', 15, TODAY), false);
  assert.equal(await claimAIQuota(db, 'u1', 0, TODAY), false);
});

test('utcDay formats the UTC calendar date', () => {
  assert.equal(utcDay(new Date('2026-10-02T23:59:59Z')), '2026-10-02');
  assert.equal(utcDay(new Date('2026-10-03T00:00:00Z')), '2026-10-03');
});
