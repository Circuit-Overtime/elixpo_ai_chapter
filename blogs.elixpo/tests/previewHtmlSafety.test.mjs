import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBlocksToHTML } from '../packages/lixeditor/src/preview/renderBlocks.js';

test('link hrefs block script schemes and attribute breakouts', () => {
  const js = renderBlocksToHTML([{ type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'x' }] }] }]);
  assert.doesNotMatch(js, /javascript:/);
  assert.match(js, /href="#"/);
  const breakout = renderBlocksToHTML([{ type: 'paragraph', content: [{ type: 'link', href: '" onmouseover="alert(1)', content: [{ type: 'text', text: 'x' }] }] }]);
  assert.doesNotMatch(breakout, /onmouseover=/);
  const protocolRelative = renderBlocksToHTML([{ type: 'paragraph', content: [{ type: 'link', href: '//evil.example/x', content: [{ type: 'text', text: 'x' }] }] }]);
  assert.match(protocolRelative, /href="#"/);
  const ok = renderBlocksToHTML([{ type: 'paragraph', content: [{ type: 'link', href: 'https://example.com/a', content: [{ type: 'text', text: 'x' }] }] }]);
  assert.match(ok, /href="https:\/\/example\.com\/a"/);
});

test('captions are escaped and duplicate headings get unique ids', () => {
  const cap = renderBlocksToHTML([{ type: 'image', props: { url: 'https://x/y.png', caption: '<img src=x onerror=alert(1)>' } }]);
  assert.doesNotMatch(cap, /<img src=x onerror/);
  assert.match(cap, /&lt;img/);
  const blocks = [
    { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
    { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
  ];
  const heads = renderBlocksToHTML(blocks);
  assert.match(heads, /id="h-hello"/);
  assert.match(heads, /id="h-hello-2"/);
  assert.ok(blocks.every((block) => block._lixId === undefined));
});
