import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMermaidFences,
  extractMermaidPaste,
} from '../src/utils/markdownMermaid.js';
import { normalizeMermaidSource } from '../src/utils/mermaidConfig.js';
import { parseMarkdownToBlocks } from '../src/components/Editor/markdownToBlocks.js';

test('Mermaid fences are extracted across casing, spacing, and CRLF newlines', () => {
  const markdown = [
    'Before',
    '``` Mermaid  \r\nflowchart TD\r\n  A --> B\r\n```',
    'Between',
    '```mermaid\nsequenceDiagram\n  A->>B: Hello\n```',
  ].join('\n');
  const result = extractMermaidFences(markdown);

  assert.deepEqual(result.diagrams, [
    'flowchart TD\r\n  A --> B',
    'sequenceDiagram\n  A->>B: Hello',
  ]);
  assert.match(result.content, /MERMAIDPLACEHOLDER0END/);
  assert.match(result.content, /MERMAIDPLACEHOLDER1END/);
  assert.doesNotMatch(result.content, /```/);
});

test('Mermaid extraction preserves meaningful indentation on boundary lines', () => {
  const result = extractMermaidFences('```mermaid\n    flowchart TD\n      A --> B\n```');

  assert.equal(result.diagrams[0], '    flowchart TD\n      A --> B');
});

test('Mermaid extraction handles long and tilde fences without touching ordinary code', () => {
  const markdown = [
    '````js',
    '```mermaid',
    'flowchart TD',
    '```',
    '````',
    '~~~ mermaid',
    'sequenceDiagram',
    '  A->>B: Hello',
    '~~~',
    '````mermaid',
    'flowchart LR',
    '  A --> B',
    '`````',
  ].join('\n');
  const result = extractMermaidFences(markdown);

  assert.deepEqual(result.diagrams, [
    'sequenceDiagram\n  A->>B: Hello',
    'flowchart LR\n  A --> B',
  ]);
  assert.match(result.content, /````js\n```mermaid\nflowchart TD\n```\n````/);
});

test('Mermaid extraction leaves an unfinished fence unchanged', () => {
  const markdown = '```mermaid\nflowchart TD\n  A --> B';
  assert.deepEqual(extractMermaidFences(markdown), { content: markdown, diagrams: [] });
});

test('rich Mermaid code-block clipboard data becomes a Mermaid placeholder', () => {
  const result = extractMermaidPaste(
    'flowchart TD\n    A --> B',
    '<pre><code class="language-mermaid">flowchart TD</code></pre>',
  );

  assert.equal(result.content, 'MERMAIDPLACEHOLDER0END');
  assert.deepEqual(result.diagrams, ['flowchart TD\n    A --> B']);
});

test('rich code blocks with a plain Mermaid class or data-lang are recognized', () => {
  for (const html of ['<pre class="mermaid">graph TD</pre>', '<code data-lang="mermaid">graph TD</code>']) {
    const result = extractMermaidPaste('graph TD\n  A --> B', html);
    assert.deepEqual(result.diagrams, ['graph TD\n  A --> B']);
  }
});

test('Mermaid source normalization accepts fences and common diagram aliases', () => {
  assert.equal(
    normalizeMermaidSource('```mermaid\nsequence\n  A->>B: Hello\n```'),
    'sequenceDiagram\n  A->>B: Hello',
  );
  assert.equal(normalizeMermaidSource('classDiagram\n  A <|-- B'), 'classDiagram\n  A <|-- B');
  assert.equal(normalizeMermaidSource('seq\n  A->>B: Hello'), 'sequenceDiagram\n  A->>B: Hello');
  assert.equal(normalizeMermaidSource('er\n  USER ||--o{ POST : writes'), 'erDiagram\n  USER ||--o{ POST : writes');
  assert.equal(normalizeMermaidSource('flowchart LR\n  A --> B'), 'flowchart LR\n  A --> B');
});

test('Markdown imports turn spaced Mermaid fences into Mermaid blocks', () => {
  const blocks = parseMarkdownToBlocks('``` Mermaid\nflowchart TD\n  A --> B\n```');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'mermaidBlock');
  assert.equal(blocks[0].props.diagram, 'flowchart TD\n  A --> B');
});

test('Markdown imports turn task markers with optional bullets into checklist blocks', () => {
  const blocks = parseMarkdownToBlocks('- [ ] Draft\n[x] Published\n[X] Verified');

  assert.deepEqual(blocks.map((block) => block.type), [
    'checkListItem',
    'checkListItem',
    'checkListItem',
  ]);
  assert.deepEqual(blocks.map((block) => block.props.checked), [false, true, true]);
  assert.deepEqual(
    blocks.map((block) => block.content[0].text),
    ['Draft', 'Published', 'Verified'],
  );
});
