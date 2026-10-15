import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  ANALYTICS_EVENT_UPSERT_SQL,
  classifyDevice,
  classifyReferrer,
  parseAnalyticsRange,
  percentChange,
} from '../lib/analytics.js';
import { buildAnalyticsTrend, resolveAnalyticsScope } from '../lib/statsAnalytics.js';

const hasSqlite = spawnSync('sqlite3', ['--version']).status === 0;

test('parses preset analytics ranges and previous period', () => {
  const now = 2_000_000;
  const range = parseAnalyticsRange(new URLSearchParams('range=7d'), now);
  assert.equal(range.to - range.from, 7 * 86400);
  assert.equal(range.previousTo, range.from);
  assert.equal(range.previousTo - range.previousFrom, 7 * 86400);
});

test('rejects invalid and oversized custom ranges', () => {
  assert.throws(() => parseAnalyticsRange(new URLSearchParams('range=custom&from=bad&to=bad')));
  assert.throws(() => parseAnalyticsRange(new URLSearchParams('range=custom&from=2024-01-01&to=2026-01-01'), Date.parse('2026-02-01') / 1000));
});

test('custom ranges include the complete end date with an exclusive upper bound', () => {
  const now = Date.parse('2026-02-01T00:00:00Z') / 1000;
  const range = parseAnalyticsRange(new URLSearchParams('range=custom&from=2026-01-01&to=2026-01-02'), now);
  assert.equal(range.from, Date.parse('2026-01-01T00:00:00Z') / 1000);
  assert.equal(range.to, Date.parse('2026-01-03T00:00:00Z') / 1000);
});

test('a custom range with the same from and to selects that single day', () => {
  const now = Date.parse('2026-01-03T00:00:00Z') / 1000;
  const range = parseAnalyticsRange(new URLSearchParams('range=custom&from=2026-01-02&to=2026-01-02'), now);
  assert.equal(range.from, Date.parse('2026-01-02T00:00:00Z') / 1000);
  assert.equal(range.to, Date.parse('2026-01-03T00:00:00Z') / 1000);
  assert.throws(() => parseAnalyticsRange(new URLSearchParams('range=custom&from=2026-01-05&to=2026-01-02'), now));
});

test('classifies acquisition without retaining full referrer URLs', () => {
  assert.deepEqual(classifyReferrer(''), { source: 'Direct', domain: null });
  assert.deepEqual(classifyReferrer('https://blogs.elixpo.com/feed'), { source: 'Internal', domain: 'blogs.elixpo.com' });
  assert.deepEqual(classifyReferrer('https://www.google.com/search?q=post'), { source: 'Search', domain: 'google.com' });
  assert.deepEqual(classifyReferrer('https://www.reddit.com/r/writing'), { source: 'Social', domain: 'reddit.com' });
});

test('lookalike referrer domains stay External', () => {
  assert.equal(classifyReferrer('https://notgoogle.com/post').source, 'External');
  assert.equal(classifyReferrer('https://myreddit.net/post').source, 'External');
  assert.equal(classifyReferrer('https://google.com.evil.example/post').source, 'External');
  assert.equal(classifyReferrer('https://search.brave.com/search?q=x').source, 'Search');
  assert.equal(classifyReferrer('https://google.co.in/search').source, 'Search');
});

test('classifies devices and computes stable percentage changes', () => {
  assert.equal(classifyDevice('Mozilla/5.0 (iPhone; Mobile)'), 'Mobile');
  assert.equal(classifyDevice('Mozilla/5.0 (iPad; Tablet)'), 'Tablet');
  assert.equal(classifyDevice('Mozilla/5.0 (X11; Linux x86_64)'), 'Desktop');
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(5, 0), 100);
});

test('personal and authorized organization scopes are isolated', async () => {
  const personal = await resolveAnalyticsScope({}, 'user-1', 'personal');
  assert.deepEqual(personal.values, ['user-1']);
  assert.match(personal.predicate, /author_id/);

  const calls = [];
  const db = {
    prepare(sql) {
      calls.push({ sql });
      return {
        bind(...values) {
          calls.at(-1).values = values;
          return { first: async () => ({ id: 'org-1', name: 'Writers' }) };
        },
      };
    },
  };
  const org = await resolveAnalyticsScope(db, 'user-1', 'org:org-1');
  assert.deepEqual(calls[0].values, ['user-1', 'org-1', 'user-1']);
  assert.match(calls[0].sql, /owner_id.*admin.*maintain/s);
  assert.deepEqual(org.values, ['org:org-1']);
});

test('organization scope rejects users without a privileged membership', async () => {
  const db = {
    prepare: () => ({ bind: () => ({ first: async () => null }) }),
  };
  await assert.rejects(
    resolveAnalyticsScope(db, 'user-2', 'org:org-1'),
    error => error.status === 403,
  );
});

test('empty datasets render a complete zero-filled trend', () => {
  const trend = buildAnalyticsTrend(0, 2 * 86400, [], []);
  assert.deepEqual(trend, {
    labels: ['1970-01-01', '1970-01-02'],
    views: [0, 0],
    reads: [0, 0],
  });
});

test('analytics dedupe constraint updates the existing event', { skip: !hasSqlite }, () => {
  const quote = value => value === null ? 'NULL' : typeof value === 'number'
    ? String(value)
    : `'${String(value).replaceAll("'", "''")}'`;
  const statement = values => {
    let index = 0;
    return ANALYTICS_EVENT_UPSERT_SQL.replaceAll('?', () => quote(values[index++]));
  };
  const base = ['event-1', 'blog-1', null, 'visitor-1', 'read_progress', 0.25, 'Direct', null, null, null, null, 'Desktop', 'US', 100, 'same-key'];
  const update = ['event-2', 'blog-1', null, 'visitor-1', 'read_progress', 0.75, 'Direct', null, 'campaign', null, null, 'Desktop', 'US', 101, 'same-key'];
  const sql = `
    CREATE TABLE analytics_events (
      id TEXT PRIMARY KEY, blog_id TEXT, user_id TEXT, visitor_hash TEXT,
      event_type TEXT, event_value REAL, referrer_source TEXT,
      referrer_domain TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
      device_category TEXT, country_code TEXT, occurred_at INTEGER,
      dedupe_key TEXT NOT NULL UNIQUE
    );
    ${statement(base)};
    ${statement(update)};
    SELECT COUNT(*), event_value, utm_source FROM analytics_events;
  `;
  const result = spawnSync('sqlite3', [':memory:'], { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '1|0.75|campaign');
});
