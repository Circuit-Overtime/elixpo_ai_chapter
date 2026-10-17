# @elixpo/lixeditor

A rich WYSIWYG block editor and renderer built on [BlockNote](https://blocknotejs.org) — with LaTeX equations, Mermaid diagrams, syntax-highlighted code blocks, and more.

## Install

```bash
npm install @elixpo/lixeditor @blocknote/core @blocknote/react @blocknote/mantine
```

## Quick Start

```jsx
import { LixEditor, LixPreview, LixThemeProvider } from '@elixpo/lixeditor';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@elixpo/lixeditor/styles';

function App() {
  const [blocks, setBlocks] = useState(null);

  return (
    <LixThemeProvider defaultTheme="dark">
      {/* Editor */}
      <LixEditor
        initialContent={blocks}
        onChange={(editor) => setBlocks(editor.getBlocks())}
        features={{
          equations: true,
          mermaid: true,
          codeHighlighting: true,
          tableOfContents: true,
          linkPreview: true,
        }}
        placeholder="Start writing..."
      />

      {/* Preview / Reader */}
      <LixPreview blocks={blocks} />
    </LixThemeProvider>
  );
}
```

The stylesheet import continues to include KaTeX automatically. LixEditor
reuses the fonts from its installed `katex` dependency instead of shipping a
duplicate copy inside the editor package.

## Features

| Feature | Default | Description |
|---------|---------|-------------|
| `equations` | `true` | Block & inline LaTeX via KaTeX |
| `mermaid` | `true` | Mermaid diagram blocks (flowchart, sequence, etc.) |
| `codeHighlighting` | `true` | Shiki syntax highlighting with 30+ languages |
| `tableOfContents` | `true` | Auto-generated TOC block |
| `images` | `true` | Image blocks with upload, embed, captions |
| `buttons` | `true` | Interactive button blocks |
| `pdf` | `true` | PDF embed blocks |
| `dates` | `true` | Inline date picker chips |
| `linkPreview` | `true` | OG metadata tooltip on link hover |
| `markdownLinks` | `true` | Auto-convert `[text](url)` to links |

## Extending

### Custom Block Specs

```jsx
<LixEditor
  extraBlockSpecs={[
    { type: 'myBlock', spec: MyCustomBlockSpec({}) }
  ]}
  extraInlineSpecs={[
    { type: 'myInline', spec: MyInlineSpec }
  ]}
  slashMenuItems={[
    { title: 'My Block', group: 'Custom', onItemClick: (editor) => { ... } }
  ]}
/>
```

### Theming

Override CSS variables to customize colors:

```css
:root {
  --lix-accent: #e040fb;
  --lix-bg-app: #fafafa;
  --lix-font-body: 'Inter', sans-serif;
}
```

### Using Individual Blocks

```jsx
import { BlockEquation, MermaidBlock, InlineEquation } from '@elixpo/lixeditor';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    blockEquation: BlockEquation({}),
    mermaidBlock: MermaidBlock({}),
  },
});
```

## API Reference

### `<LixEditor />`

| Prop | Type | Description |
|------|------|-------------|
| `initialContent` | `Block[]` | Initial BlockNote document |
| `onChange` | `(editor) => void` | Called on content change |
| `features` | `object` | Enable/disable features |
| `codeLanguages` | `object` | Custom language map for code blocks |
| `extraBlockSpecs` | `array` | Additional block specs |
| `extraInlineSpecs` | `array` | Additional inline content specs |
| `slashMenuItems` | `array` | Extra slash menu items |
| `placeholder` | `string` | Editor placeholder text |
| `collaboration` | `object` | Yjs collaboration config |
| `ref` | `ref` | Access editor methods: `getBlocks()`, `getHTML()`, `getMarkdown()` |

### `<LixPreview />`

| Prop | Type | Description |
|------|------|-------------|
| `blocks` | `Block[]` | BlockNote document to render |
| `html` | `string` | Fallback raw HTML |
| `features` | `object` | Enable/disable post-processing features |

### `<LixThemeProvider />`

| Prop | Type | Description |
|------|------|-------------|
| `defaultTheme` | `'light' \| 'dark'` | Initial theme |
| `storageKey` | `string` | localStorage key for persistence |

## License

MIT
