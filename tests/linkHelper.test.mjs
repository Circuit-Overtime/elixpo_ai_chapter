import test from 'node:test';
import assert from 'node:assert';
import { escapeHtmlAttribute, normalizeCssColor, normalizeImageUrl, normalizeUrl } from '../src/utils/linkHelper.js';

test('normalizeUrl preserves absolute HTTP/HTTPS URLs', () => {
  assert.strictEqual(normalizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.strictEqual(normalizeUrl('http://example.com/path?q=1#fr'), 'http://example.com/path?q=1#fr');
});

test('normalizeUrl normalizes scheme-less URLs to https', () => {
  assert.strictEqual(normalizeUrl('example.com/path'), 'https://example.com/path');
  assert.strictEqual(normalizeUrl('www.google.com'), 'https://www.google.com');
  assert.strictEqual(normalizeUrl('sub.domain.org/path?q=1#abc'), 'https://sub.domain.org/path?q=1#abc');
  assert.strictEqual(normalizeUrl('localhost:3000'), 'https://localhost:3000');
  assert.strictEqual(normalizeUrl('//cdn.example.com/file.js'), 'https://cdn.example.com/file.js');
});

test('normalizeUrl preserves internal paths and anchors', () => {
  assert.strictEqual(normalizeUrl('/some-internal-path'), '/some-internal-path');
  assert.strictEqual(normalizeUrl('#some-anchor'), '#some-anchor');
});

test('normalizeUrl preserves safe non-HTTP protocols', () => {
  assert.strictEqual(normalizeUrl('mailto:user@example.com'), 'mailto:user@example.com');
  assert.strictEqual(normalizeUrl('tel:+1234567890'), 'tel:+1234567890');
  assert.strictEqual(normalizeUrl('sms:+1234567890'), 'sms:+1234567890');
});

test('normalizeUrl rejects executable and unsupported protocols', () => {
  assert.strictEqual(normalizeUrl('javascript:alert(1)'), '');
  assert.strictEqual(normalizeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.strictEqual(normalizeUrl('vbscript:msgbox(1)'), '');
  assert.strictEqual(normalizeUrl('ftp://files.example.com'), '');
});

test('escapeHtmlAttribute escapes link attribute delimiters', () => {
  assert.strictEqual(
    escapeHtmlAttribute('https://example.com/?a="b"&c=<d>'),
    'https://example.com/?a=&quot;b&quot;&amp;c=&lt;d&gt;'
  );
});

test('normalizeImageUrl accepts only HTTP image sources', () => {
  assert.strictEqual(normalizeImageUrl('https://cdn.example.com/image.webp'), 'https://cdn.example.com/image.webp');
  assert.strictEqual(normalizeImageUrl('//cdn.example.com/image.webp'), 'https://cdn.example.com/image.webp');
  assert.strictEqual(normalizeImageUrl('data:image/svg+xml,<svg/>'), '');
  assert.strictEqual(normalizeImageUrl('javascript:alert(1)'), '');
});

test('normalizeCssColor rejects declarations that escape the color property', () => {
  assert.strictEqual(normalizeCssColor('#9b7bf7'), '#9b7bf7');
  assert.strictEqual(normalizeCssColor('rgba(12, 34, 56, .5)'), 'rgba(12, 34, 56, .5)');
  assert.strictEqual(normalizeCssColor('red;position:fixed;inset:0'), '');
  assert.strictEqual(normalizeCssColor('url(https://example.com/track)'), '');
});
