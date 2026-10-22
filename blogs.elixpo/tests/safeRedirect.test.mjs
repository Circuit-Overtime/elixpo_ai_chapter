import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRelativeRedirect } from '../lib/safeRedirect.js';

test('safeRelativeRedirect keeps same-site paths and query strings', () => {
  assert.equal(safeRelativeRedirect('/edit/post?tab=publish#slug'), '/edit/post?tab=publish#slug');
});

test('safeRelativeRedirect rejects absolute and network-path redirects', () => {
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '\\example.com', 'javascript:alert(1)']) {
    assert.equal(safeRelativeRedirect(value), '');
  }
});
