import test from 'node:test';
import assert from 'node:assert/strict';
import { containsProfanity, findProfanity } from '../lib/validate.js';

test('innocent words containing core terms are clean', () => {
  assert.equal(findProfanity('I love grapes'), null);
  assert.equal(findProfanity('scrape the paint'), null);
  assert.equal(findProfanity('drape the curtain'), null);
  assert.equal(containsProfanity('grapes'), false);
});

test('plain and leet core terms still match', () => {
  assert.equal(findProfanity('that is rape'), 'rape');
  assert.equal(findProfanity('r4pe'), 'rape');
  assert.equal(findProfanity('shit happens'), 'shit');
});
