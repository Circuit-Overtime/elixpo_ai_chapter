import assert from 'node:assert/strict';
import test from 'node:test';

import { getHeadingSection } from '../src/utils/headingSections.js';

const heading = (id, level) => ({ id, type: 'heading', props: { level } });
const paragraph = (id) => ({ id, type: 'paragraph' });

test('moves a heading with its paragraphs and nested subsections', () => {
  const blocks = [
    heading('intro', 1),
    paragraph('intro-copy'),
    heading('details', 2),
    paragraph('details-copy'),
    heading('next', 1),
    paragraph('next-copy'),
  ];

  assert.deepEqual(
    getHeadingSection(blocks, 'intro').map((block) => block.id),
    ['intro', 'intro-copy', 'details', 'details-copy'],
  );
  assert.deepEqual(
    getHeadingSection(blocks, 'details').map((block) => block.id),
    ['details', 'details-copy'],
  );
});

test('stops at the next heading of the same or higher level', () => {
  const blocks = [
    heading('nested', 3),
    paragraph('nested-copy'),
    heading('parent', 2),
    paragraph('parent-copy'),
  ];

  assert.deepEqual(
    getHeadingSection(blocks, 'nested').map((block) => block.id),
    ['nested', 'nested-copy'],
  );
});

test('ignores non-heading drag origins', () => {
  assert.deepEqual(getHeadingSection([paragraph('copy')], 'copy'), []);
});
