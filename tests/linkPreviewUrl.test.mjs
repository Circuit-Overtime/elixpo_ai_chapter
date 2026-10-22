import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafePreviewUrl, resolvePreviewAsset } from '../lib/linkPreviewUrl.js';

test('preview URLs accept public HTTP targets', () => {
  assert.equal(isSafePreviewUrl('https://example.com/post'), true);
  assert.equal(isSafePreviewUrl('http://example.com/post'), true);
});

test('preview URLs reject local, private, authenticated, and non-HTTP targets', () => {
  for (const value of [
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.1',
    'http://[::1]',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a00:1]/',
    'http://[::ffff:c0a8:101]/',
    'http://[::ffff:ac10:1]/',
    'https://user:secret@example.com',
    'file:///etc/passwd',
  ]) {
    assert.equal(isSafePreviewUrl(value), false, value);
  }
});

test('preview assets resolve relative to the final document path', () => {
  const documentUrl = new URL('https://target.example/articles/launch/index.html');
  assert.equal(
    resolvePreviewAsset('../images/cover.webp', documentUrl),
    'https://target.example/articles/images/cover.webp',
  );
  assert.equal(
    resolvePreviewAsset('/favicon.ico', documentUrl),
    'https://target.example/favicon.ico',
  );
  assert.equal(resolvePreviewAsset('javascript:alert(1)', documentUrl), '');
});
