# LixEditor for VS Code

A rich WYSIWYG block editor for `.lixeditor` files — right inside VS Code.

<div align="center">
  <img src="https://blogs.elixpo.com/base-logo.png" alt="LixEditor" width="80" />
  <br /><br />

  [![VS Code](https://img.shields.io/badge/VS_Code-Extension-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)
  [![npm](https://img.shields.io/npm/v/@elixpo/lixeditor?style=for-the-badge&color=cb3837&logo=npm&logoColor=white&label=npm%20package)](https://www.npmjs.com/package/@elixpo/lixeditor)
  [![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
</div>

---

## What is LixEditor?

LixEditor brings a **Notion-like WYSIWYG editing experience** to VS Code. Create and edit `.lixeditor` documents with a rich block editor — no markdown syntax to remember, no preview pane needed. What you see is what you get.

Built on [BlockNote](https://blocknotejs.org) — the same editor engine that powers [LixBlogs](https://blogs.elixpo.com).

---

## Features

| | Feature | Description |
|:---:|:---|:---|
| :writing_hand: | **Rich Block Editor** | Paragraphs, headings (H1-H3), lists, checklists, blockquotes, tables |
| :art: | **Syntax Highlighting** | Code blocks with Shiki — 25+ languages with color themes |
| :link: | **Smart Links** | Type `[text](url)` to auto-create links, paste URLs to auto-link |
| :framed_picture: | **Image Blocks** | Upload from disk, embed by URL, paste, or drag & drop |
| :calendar: | **Date Stamps** | Press `Ctrl+D` to insert today's date as an inline chip |
| :zap: | **Slash Commands** | Type `/` to insert any block type |
| :floppy_disk: | **Auto-Save** | Changes sync back to the file automatically (800ms debounce) |
| :open_file_folder: | **Import / Export** | Import `.lixeditor` files, export as raw Markdown |
| :art: | **Theme Aware** | Automatically adapts to your VS Code light or dark theme |
| :globe_with_meridians: | **Link Preview** | Hover any link to see a preview tooltip with domain + favicon |
| :keyboard: | **Markdown Shortcuts** | Bold, italic, strikethrough, code — all the shortcuts you know |

---

## Getting Started

1. **Install** the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=elixpo.lixeditor)
2. **Create** a file with the `.lixeditor` extension (e.g. `notes.lixeditor`)
3. **Open** it — the rich editor loads automatically
4. **Write** using `/` slash commands, markdown shortcuts, or just type

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---------|:-------|
| `/` | Open slash command menu |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+S` | Strikethrough |
| `Ctrl+E` | Inline code |
| `Ctrl+K` | Create link |
| `Ctrl+D` | Insert date chip |
| `Tab` | Indent / Nest block |
| `Shift+Tab` | Unindent |
| `---` | Horizontal rule |
| ` ``` ` | Code block |
| `[text](url)` | Auto-convert to link |
| `![alt](url)` | Auto-embed image |

---

## File Format

`.lixeditor` files store content as **JSON** in [BlockNote document format](https://blocknotejs.org). The editor reads and writes this format transparently — you never need to edit the JSON directly.

You can also export your document as **Markdown** using the download button in the header bar.

---

## Header Bar

The editor includes a minimal header with:

| Icon | Action |
|:----:|:-------|
| 📄 | Document title (click to rename) |
| 📂 | Open / import a file |
| ⬇️ | Export as Markdown (.md) |
| 💾 | Save to disk |
| **?** | Keyboard shortcuts reference |

---

## Use the Editor in Your Own App

The same editor is available as an **npm package** for React and Next.js:

```bash
npm install @elixpo/lixeditor @blocknote/core @blocknote/react @blocknote/mantine
```

```jsx
import { LixEditor, LixPreview } from '@elixpo/lixeditor';
import '@elixpo/lixeditor/styles';

<LixEditor
  initialContent={blocks}
  onChange={(editor) => save(editor.getBlocks())}
/>
```

:point_right: **[npm package docs](https://www.npmjs.com/package/@elixpo/lixeditor)**

---

## About

Built by **[Elixpo](https://github.com/elixpo)** — the team behind [LixBlogs](https://blogs.elixpo.com), an open-source blogging platform with AI writing tools, real-time collaboration, and organizations.

| | Link |
|:---:|:---|
| :globe_with_meridians: | [blogs.elixpo.com](https://blogs.elixpo.com) |
| :package: | [@elixpo/lixeditor on npm](https://www.npmjs.com/package/@elixpo/lixeditor) |
| :octocat: | [Source on GitHub](https://github.com/elixpo/lixblogs) |
| :bug: | [Report an issue](https://github.com/elixpo/lixblogs/issues) |

---

## License

MIT — see [LICENSE](../../LICENSE) for details.
