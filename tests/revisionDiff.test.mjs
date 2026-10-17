import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRevisionBlocks, revisionText } from '../lib/revisionDiff.js';

test('revision text keeps block structure readable', () => {
  assert.equal(revisionText([
    { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Intro' }] },
    { type: 'bulletListItem', content: [{ type: 'text', text: 'First point' }] },
  ]), '## Intro\n\n- First point');
});

test('revision diffs identify additions and deletions', () => {
  const changes = diffRevisionBlocks(
    [{ type: 'paragraph', content: [{ type: 'text', text: 'A draft explanation.' }] }],
    [{ type: 'paragraph', content: [{ type: 'text', text: 'A clearer explanation.' }] }],
  );

  assert.ok(changes.some((part) => part.removed && part.value === 'draft'));
  assert.ok(changes.some((part) => part.added && part.value === 'clearer'));
});