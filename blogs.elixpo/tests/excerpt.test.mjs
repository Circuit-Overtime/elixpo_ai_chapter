import test from 'node:test';
import assert from 'node:assert/strict';
import { excerptFromBlocks } from '../lib/excerpt.js';

test('returns empty string for non-array input', () => {
  assert.equal(excerptFromBlocks(null), '');
  assert.equal(excerptFromBlocks(undefined), '');
  assert.equal(excerptFromBlocks('string'), '');
  assert.equal(excerptFromBlocks({}), '');
});

test('extracts text from block content arrays', () => {
  const blocks = [
    { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
    { type: 'heading', content: [{ type: 'text', text: 'A heading' }] },
    { type: 'bulletListItem', content: [{ type: 'text', text: 'List item.' }] },
  ];
  assert.equal(excerptFromBlocks(blocks), 'First paragraph. A heading List item.');
});

test('skips non-prose block types', () => {
  const blocks = [
    { type: 'image', props: { url: 'https://example.com/img.png' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Visible text.' }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
    { type: 'table', content: [{ type: 'text', text: 'Table data' }] },
    { type: 'equation', props: { latex: 'x^2' } },
  ];
  assert.equal(excerptFromBlocks(blocks), 'Visible text.');
});

test('walks nested children blocks', () => {
  const blocks = [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Parent.' }],
      children: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Child one.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Child two.' }] },
      ],
    },
  ];
  assert.equal(excerptFromBlocks(blocks), 'Parent. Child one. Child two.');
});

test('truncates at word boundary with ellipsis when exceeding max', () => {
  const blocks = [
    { type: 'paragraph', content: [{ type: 'text', text: 'This is a longer sentence that will exceed the limit.' }] },
  ];
  assert.equal(excerptFromBlocks(blocks, 20), 'This is a longer…');
  assert.equal(excerptFromBlocks(blocks, 50), 'This is a longer sentence that will exceed the…');
});

test('truncation keeps emoji pairs intact', () => {
  const grin = String.fromCodePoint(0x1f600);
  const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: grin.repeat(10) }] }];
  const out = excerptFromBlocks(blocks, 5);
  assert.equal(Array.from(out.replace('…', '')).length, 5);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out), 'no lone surrogate');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(out)));
});

test('keeps the text of inline links', () => {
  const blocks = [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Read the ' },
        { type: 'link', href: 'https://example.com/docs', content: [{ type: 'text', text: 'setup guide' }] },
        { type: 'text', text: ' first.' },
      ],
    },
  ];
  assert.equal(excerptFromBlocks(blocks), 'Read the setup guide first.');
});
