import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBlocksToHTML } from '../packages/lixeditor/src/preview/renderBlocks.js';
import { normalizeLegacyChecklistBlocks } from '../src/utils/checklistBlocks.js';

const legacyBlocks = [
  {
    type: 'bulletListItem',
    props: {},
    content: [
      { type: 'text', text: '[x] ', styles: {} },
      { type: 'text', text: 'lixblogs whoami', styles: { code: true } },
      { type: 'text', text: ' shows the intended account.', styles: {} },
    ],
  },
  {
    type: 'bulletListItem',
    props: {},
    content: [{ type: 'text', text: '[ ] Review the draft.', styles: {} }],
  },
];

test('normalizes legacy bullet checkbox markers without losing inline styles', () => {
  const normalized = normalizeLegacyChecklistBlocks(legacyBlocks);

  assert.deepEqual(normalized.map((block) => block.type), ['checkListItem', 'checkListItem']);
  assert.deepEqual(normalized.map((block) => block.props.checked), [true, false]);
  assert.equal(normalized[0].content[0].text, 'lixblogs whoami');
  assert.equal(normalized[0].content[0].styles.code, true);
  assert.equal(normalized[1].content[0].text, 'Review the draft.');
});

test('renders legacy bullet checkbox markers as a checklist', () => {
  const html = renderBlocksToHTML(legacyBlocks);

  assert.match(html, /class="lix-checklist"/);
  assert.match(html, /class="lix-check lix-check--checked"/);
  assert.match(html, /<code>lixblogs whoami<\/code>/);
  assert.doesNotMatch(html, /\[x\]|\[ \]/);
});
