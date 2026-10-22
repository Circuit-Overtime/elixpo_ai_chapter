import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChecklistShortcut } from '../src/utils/checklistShortcut.js';

test('recognizes checked and unchecked checklist shortcuts', () => {
  assert.deepEqual(parseChecklistShortcut('[ ]'), { checked: false });
  assert.deepEqual(parseChecklistShortcut('[x]'), { checked: true });
  assert.deepEqual(parseChecklistShortcut('[X]'), { checked: true });
});

test('ignores incomplete or non-shortcut text', () => {
  assert.equal(parseChecklistShortcut('[ ] task'), null);
  assert.equal(parseChecklistShortcut('text'), null);
});
