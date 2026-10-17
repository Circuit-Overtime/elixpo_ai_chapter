import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccountUsername } from '../lib/accountProfileSync.js';

test('normalizes usernames using the Accounts handle contract', () => {
  assert.equal(normalizeAccountUsername('  Anwesha_Chakraborty  '), 'anwesha_chakraborty');
  assert.equal(normalizeAccountUsername('anwesha-chakraborty'), 'anwesha-chakraborty');
});

test('rejects malformed account usernames before changing canonical URLs', () => {
  assert.equal(normalizeAccountUsername('ab'), '');
  assert.equal(normalizeAccountUsername('-invalid'), '');
  assert.equal(normalizeAccountUsername('invalid--name'), '');
  assert.equal(normalizeAccountUsername('invalid name'), '');
});
