import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_OFFSET, MAX_PAGE, parseLimit, parseOffset, parsePage } from '../lib/pagination.js';

test('limit keeps valid values and caps them at the route maximum', () => {
  assert.equal(parseLimit('15', 20, 50), 15);
  assert.equal(parseLimit('50', 20, 50), 50);
  assert.equal(parseLimit('500', 20, 50), 50);
});

test('limit never reaches SQL as a negative or zero value', () => {
  // SQLite treats LIMIT -1 as "no limit", which would return every row.
  assert.equal(parseLimit('-1', 20, 50), 1);
  assert.equal(parseLimit('0', 20, 50), 1);
});

test('limit falls back to the default for missing or non-numeric input', () => {
  assert.equal(parseLimit(null, 20, 50), 20);
  assert.equal(parseLimit('', 10, 20), 10);
  assert.equal(parseLimit('abc', 5, 20), 5);
  assert.equal(parseLimit('99999999999999999999', 20, 50), 20);
});

test('page is at least 1, capped, and defaults to 1', () => {
  assert.equal(parsePage('3'), 3);
  assert.equal(parsePage('0'), 1);
  assert.equal(parsePage('-4'), 1);
  assert.equal(parsePage('abc'), 1);
  assert.equal(parsePage(null), 1);
  assert.equal(parsePage(String(MAX_PAGE + 1)), MAX_PAGE);
});

test('offset is never negative, capped, and defaults to 0', () => {
  assert.equal(parseOffset('40'), 40);
  assert.equal(parseOffset('-20'), 0);
  assert.equal(parseOffset('abc'), 0);
  assert.equal(parseOffset(undefined), 0);
  assert.equal(parseOffset(String(MAX_OFFSET + 1)), MAX_OFFSET);
});

test('the deepest page still produces a safe integer offset', () => {
  const offset = (parsePage('9007199254740991') - 1) * parseLimit('50', 20, 50);
  assert.ok(Number.isSafeInteger(offset));
});
