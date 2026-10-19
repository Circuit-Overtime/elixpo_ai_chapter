import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DESIGNATION_LENGTH, normalizeDesignation } from '../lib/profile.js';

test('designation normalization keeps one concise plain-text line', () => {
  assert.equal(normalizeDesignation('  Staff   engineer\n& writer  '), 'Staff engineer & writer');
  assert.equal(normalizeDesignation(null), '');
  assert.equal(normalizeDesignation(undefined), undefined);
});

test('designation normalization rejects invalid or oversized input', () => {
  assert.throws(() => normalizeDesignation(42), /must be text/i);
  assert.throws(() => normalizeDesignation('x'.repeat(MAX_DESIGNATION_LENGTH + 1)), /characters or fewer/i);
});
