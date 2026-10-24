import test from 'node:test';
import assert from 'node:assert/strict';
import { articleImageVariants, blogExcerpt, extractBlogText, safeJsonLd } from '../src/utils/seoContent.js';

test('extractBlogText builds a useful excerpt and ignores code and media blocks', () => {
  const blocks = [
    { type: 'image', props: { url: 'https://example.com/a.png' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'A useful opening paragraph.' }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const secret = true' }] },
    { type: 'bulletListItem', content: [{ type: 'text', text: 'A useful detail.' }] },
  ];
  assert.equal(extractBlogText(blocks), 'A useful opening paragraph. A useful detail.');
  assert.equal(blogExcerpt({ content: blocks }), 'A useful opening paragraph. A useful detail.');
});

test('blogExcerpt prefers an authored subtitle or stored excerpt', () => {
  assert.equal(blogExcerpt({ subtitle: '  Authored summary  ', excerpt: 'Fallback' }), 'Authored summary');
  assert.equal(blogExcerpt({ excerpt: ' Stored summary ' }), 'Stored summary');
});

test('articleImageVariants emits the three Google-recommended aspect ratios for Cloudinary', () => {
  const variants = articleImageVariants('https://res.cloudinary.com/demo/image/upload/v1/post.webp');
  assert.equal(variants.length, 3);
  assert.match(variants[0], /w_1200,h_1200/);
  assert.match(variants[1], /w_1200,h_900/);
  assert.match(variants[2], /w_1200,h_675/);
});

test('safeJsonLd prevents user content from closing the script element', () => {
  const json = safeJsonLd({ title: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(json, /<\/script>/i);
  assert.match(json, /\\u003c\/script\\u003e/);
});
