// Tests for lib/searchQuery.js — the LixBlogs search protocol.
//
// Two of these are security tests, not feature tests: `author:` and `-author:` must
// never be usable to identify the writer of a secret (anonymous) post. If those
// break, the qualifier becomes a deanonymization tool.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery, buildBlogSearch, isEmptyQuery, SORTS } from '../lib/searchQuery.js';

// ── parsing ─────────────────────────────────────────────────────────────────
test('parses bare free text', () => {
  const p = parseSearchQuery('hacktoberfest rookie');
  assert.deepEqual(p.text, ['hacktoberfest', 'rookie']);
  assert.deepEqual(p.phrases, []);
});

test('parses quoted phrases separately from bare words', () => {
  const p = parseSearchQuery('"open source" rookie');
  assert.deepEqual(p.phrases, ['open source']);
  assert.deepEqual(p.text, ['rookie']);
});

test('parses qualifiers, negation and @-stripping', () => {
  const p = parseSearchQuery('tag:open-source -tag:spam author:@nonsense3 org:gdgoc');
  assert.deepEqual(p.tags, ['open-source']);
  assert.deepEqual(p.notTags, ['spam']);
  assert.deepEqual(p.authors, ['nonsense3'], '@ prefix should be stripped');
  assert.deepEqual(p.orgs, ['gdgoc']);
});

test('parses quoted qualifier values', () => {
  const p = parseSearchQuery('tag:"machine learning"');
  assert.deepEqual(p.tags, ['machine learning']);
});

test('is:secret and -is:secret set the secret tri-state', () => {
  assert.equal(parseSearchQuery('is:secret').secret, true);
  assert.equal(parseSearchQuery('-is:secret').secret, false);
  assert.equal(parseSearchQuery('hello').secret, null, 'no opinion when unspecified');
});

test('is:<status> feeds the status filter', () => {
  assert.deepEqual(parseSearchQuery('is:unlisted').statuses, ['unlisted']);
});

test('sort: only accepts known keys', () => {
  assert.equal(parseSearchQuery('sort:likes').sort, 'likes');
  const bad = parseSearchQuery('sort:banana');
  assert.equal(bad.sort, null);
  assert.ok(bad.unknown.includes('sort:banana'));
});

test('in: only accepts known fields', () => {
  assert.deepEqual(parseSearchQuery('in:title').in, ['title']);
  assert.ok(parseSearchQuery('in:nope').unknown.includes('in:nope'));
});

test('unknown qualifiers fall back to free text and are reported', () => {
  const p = parseSearchQuery('athor:bob');
  assert.ok(p.unknown.includes('athor:bob'), 'typo should be reported');
  assert.deepEqual(p.text, ['athor:bob'], 'and still searched as text rather than dropped');
});

test('isEmptyQuery distinguishes "nothing" from "qualifier-only"', () => {
  assert.ok(isEmptyQuery(parseSearchQuery('')));
  assert.ok(isEmptyQuery(parseSearchQuery('   ')));
  assert.ok(!isEmptyQuery(parseSearchQuery('tag:ai')), 'tag-only is a real query');
});

// ── dates ───────────────────────────────────────────────────────────────────
test('created: comparisons map to the right operators', () => {
  assert.equal(parseSearchQuery('created:>=2025-10-01').dates[0].op, '>=');
  assert.equal(parseSearchQuery('created:<2025-10-01').dates[0].op, '<');
  assert.equal(parseSearchQuery('created:>2025-10-01').dates[0].op, '>');
});

test('a bare date means the whole day, not midnight', () => {
  const d = parseSearchQuery('created:2025-10-01').dates[0];
  assert.equal(d.op, 'between');
  assert.equal(d.to - d.from, 86399, 'should span exactly one day');
});

test('date ranges parse inclusively', () => {
  const d = parseSearchQuery('published:2025-10-01..2025-10-31').dates[0];
  assert.equal(d.op, 'between');
  assert.equal(d.col, 'b.published_at');
  assert.equal((d.to - d.from + 1) / 86400, 31, 'October is 31 days, inclusive');
});

test('malformed dates are reported, not silently dropped', () => {
  const p = parseSearchQuery('created:yesterday');
  assert.equal(p.dates.length, 0);
  assert.ok(p.unknown.includes('created:yesterday'));
});

// ── SQL building: security rules ────────────────────────────────────────────
test('SECURITY: author: never matches a secret post', () => {
  const { where, binds } = buildBlogSearch(parseSearchQuery('author:nonsense3'));
  assert.match(where, /b\.secret = 0/, 'author: must exclude secret posts');
  assert.ok(binds.includes('nonsense3'));
});

test('SECURITY: -author: leaves secret posts in place (no disappearance oracle)', () => {
  const { where } = buildBlogSearch(parseSearchQuery('-author:nonsense3'));
  // Secret posts must survive the exclusion, otherwise toggling -author:x and
  // watching a post vanish confirms who wrote it.
  assert.match(where, /b\.secret = 1 OR/, '-author: must not filter secret posts out');
});

test('org: DOES match secret posts (an org is not a person)', () => {
  const { where } = buildBlogSearch(parseSearchQuery('org:gdgoc'));
  assert.doesNotMatch(where, /b\.secret = 0/, 'org: must not exclude secret posts');
  assert.match(where, /LOWER\(o\.slug\) IN/);
});

// ── SQL building: behaviour ─────────────────────────────────────────────────
test('repeated tags AND together', () => {
  const { where, binds } = buildBlogSearch(parseSearchQuery('tag:ai tag:opensource'));
  assert.equal((where.match(/EXISTS \(SELECT 1 FROM blog_tags/g) || []).length, 2);
  assert.ok(binds.includes('ai') && binds.includes('opensource'));
});

test('-tag: becomes NOT EXISTS', () => {
  const { where } = buildBlogSearch(parseSearchQuery('-tag:spam'));
  assert.match(where, /NOT EXISTS \(SELECT 1 FROM blog_tags/);
});

test('free text ANDs across terms and ORs across fields', () => {
  const { where, binds } = buildBlogSearch(parseSearchQuery('rookie hacktoberfest'));
  // 2 terms × 4 default fields
  assert.equal(binds.filter(b => typeof b === 'string' && b.startsWith('%')).length, 8);
  assert.match(where, /LIKE \?/);
});

test('wildcard characters in search terms are escaped literally', () => {
  const percent = buildBlogSearch(parseSearchQuery('100%'));
  assert.ok(percent.binds.some((b) => b === '%100\\%%'));
  const underscore = buildBlogSearch(parseSearchQuery('a_b'));
  assert.ok(underscore.binds.some((b) => b === '%a\\_b%'));
  assert.match(percent.where, /ESCAPE/);
});

test('in:title restricts free text to one column', () => {
  const { binds } = buildBlogSearch(parseSearchQuery('in:title rookie'));
  assert.equal(binds.filter(b => b === '%rookie%').length, 1, 'only the title column');
});

test('default status applies when the query names none', () => {
  const { binds } = buildBlogSearch(parseSearchQuery('rookie'), { defaultStatus: ['published'] });
  assert.ok(binds.includes('published'));
});

test('is:secret / -is:secret pin the secret column', () => {
  assert.match(buildBlogSearch(parseSearchQuery('is:secret')).where, /b\.secret = 1/);
  assert.match(buildBlogSearch(parseSearchQuery('-is:secret')).where, /b\.secret = 0/);
});

test('sort: selects a known ORDER BY, default is recency', () => {
  assert.equal(buildBlogSearch(parseSearchQuery('sort:likes')).orderBy, SORTS.likes);
  assert.equal(buildBlogSearch(parseSearchQuery('rookie')).orderBy, 'b.published_at DESC');
});

test('every bind is a primitive — no object leaks into D1', () => {
  const { binds } = buildBlogSearch(
    parseSearchQuery('tag:ai author:bob org:gdgoc "a phrase" created:>2025-01-01 sort:likes'),
  );
  for (const b of binds) {
    assert.ok(['string', 'number'].includes(typeof b), `bad bind: ${JSON.stringify(b)}`);
  }
});

test('placeholder count matches bind count', () => {
  const q = 'tag:ai -tag:spam author:bob -author:eve org:gdgoc rookie "open source" created:2025-10-01 is:unlisted';
  const { where, binds } = buildBlogSearch(parseSearchQuery(q));
  assert.equal((where.match(/\?/g) || []).length, binds.length, 'a mismatch here is a runtime SQL error');
});
