import test from 'node:test';
import assert from 'node:assert/strict';

import { clearInheritedBlockTextColors } from '../src/utils/blockColorNormalization.js';

test('clears a contiguous leaked-gray run after code and Mermaid blocks', () => {
  const blocks = clearInheritedBlockTextColors([
    { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'After code', styles: { textColor: '#9ca3af', bold: true } }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Still leaked', styles: { textColor: '#9ca3af' } }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Last leaked line', styles: { textColor: 'rgba(156, 163, 175, 1)' } }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Normal text' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Intentional gray', styles: { textColor: '#9ca3af' } }] },
    { type: 'mermaidBlock', props: { diagram: 'flowchart LR' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After diagram', styles: { textColor: 'rgb(156, 163, 175)' } }] },
  ]);

  assert.deepEqual(blocks[1].content[0].styles, { bold: true });
  assert.deepEqual(blocks[2].content[0].styles, {});
  assert.deepEqual(blocks[3].content[0].styles, {});
  assert.equal(blocks[5].content[0].styles.textColor, '#9ca3af');
  assert.deepEqual(blocks[7].content[0].styles, {});
});

test('preserves deliberately gray text away from a special-block boundary', () => {
  const blocks = clearInheritedBlockTextColors([
    { type: 'paragraph', content: [{ type: 'text', text: 'Normal' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Intentional gray', styles: { textColor: '#9ca3af' } }] },
  ]);

  assert.equal(blocks[1].content[0].styles.textColor, '#9ca3af');
});
