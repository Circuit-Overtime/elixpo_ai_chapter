# Integrating @elixpo/lixeditor: A Notion-Style WYSIWYG Editor 

LixSketch is a canvas-first tool, but every diagram needs a doc next to it. Instead of building a WYSIWYG editor from scratch, we shipped one we'd already built for [blogs.elixpo](https://blogs.elixpo.com): **`@elixpo/lixeditor`**, published to npm.

## Why a Standalone Package?

Two products needed the same editor. Three options:

1. Copy-paste the source — fine today, painful tomorrow.
2. Workspace dep across two repos — fragile across deploy pipelines.
3. **Publish to npm** — single source of truth, semver-pinned, fixes propagate via version bump.

We picked option 3. The package lives in [`blogs.elixpo/packages/lixeditor`](https://github.com/elixpo/blogs.elixpo/tree/main/packages/lixeditor) and a GitHub Actions workflow auto-bumps + publishes on every merge.

## The Whole Integration

```jsx
'use client'

import { LixEditor, LixThemeProvider } from '@elixpo/lixeditor'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '@elixpo/lixeditor/styles'

export default function DocsPanel() {
  return (
    <LixThemeProvider defaultTheme="dark">
      <LixEditor
        initialContent={blocks}
        onChange={(editor) => save(editor.document)}
        features={{ equations: true, mermaid: true, code: true }}
      />
    </LixThemeProvider>
  )
}
```

Three CSS imports, one provider, one component. That's it. Everything else — slash menu, formatting toolbar, KaTeX, Mermaid, Shiki-highlighted code, table support, keyboard shortcuts — comes bundled.

## What You Get For Free

- Block markdown shortcuts (`# `, `## `, `> `, `--- `, `1. `, `[] `, `` ``` ``)
- Inline formatting (`Ctrl+B/I/U/E`, paste-to-link)
- LaTeX equations (block + inline) via KaTeX
- Mermaid diagrams with live rendering
- Code blocks with Shiki syntax highlighting
- Tables, callouts, toggles, checklists
- `Ctrl+D` inserts today's date as an inline chip
- Built-in keyboard shortcuts modal

Disable any feature via the `features` prop.

## Real Bugs We Hit

Listing these honestly — every npm integration finds friction.

1. **Slash menu duplicate group headers** — BlockNote's `SuggestionMenu` assumes items are pre-sorted by group; our custom items interleaved with defaults. Fix: stable-sort by group via `filterSuggestionItems`. Now in the package.
2. **Block equations rendered as plain text** — KaTeX CSS wasn't bundled. Now it is, via `@import 'katex/dist/katex.min.css'` in the package's stylesheet.
3. **Internal styles scoped to `.blog-editor-wrapper`** — only worked inside blogs.elixpo. Bulk-renamed to `.lix-editor-wrapper` so any consumer picks them up.
4. **Side menu (`+` / drag handle) clipped on narrow panes** — Floating UI computes `left = block.left - menu.width`. In our 35-65% split layout, that pushed the icons into the host's `overflow-y: auto` clip zone. Fix: pad the inner wrapper (not the scroll container) and stack the icons vertically.
5. **Theme bleed across `*.elixpo.com`** — `LixThemeProvider` writes `data-theme` to documentElement and persists to localStorage. Use a unique `storageKey` per app (we use `lixsketch_doc_theme`).

## What's Next

- Lazy-load Mermaid and KaTeX per-block — most docs don't have either.
- Native vertical side-menu layout (no consumer CSS overrides).
- All theming via CSS variables, no `!important` overrides.

## Try It

```bash
npm install @elixpo/lixeditor \
  @blocknote/core @blocknote/react @blocknote/mantine \
  @mantine/core @mantine/hooks
```

[`@elixpo/lixeditor` on npm →](https://www.npmjs.com/package/@elixpo/lixeditor)

Open any LixSketch canvas, hit the **Split** toggle in the header, and the editor is right there — same encrypted session key as the canvas, same Cloudflare D1 backing store, one `Ctrl+S` saves both.

Source for the wiring: [`DocsPanel.jsx`](https://github.com/elixpo/lixsketch/blob/main/src/components/docs/DocsPanel.jsx), [`docs-theme.css`](https://github.com/elixpo/lixsketch/blob/main/src/components/docs/docs-theme.css), [`useDocAutoSave.js`](https://github.com/elixpo/lixsketch/blob/main/src/hooks/useDocAutoSave.js).

Bug? Open an issue with the `lixeditor` label on [`elixpo/blogs.elixpo`](https://github.com/elixpo/blogs.elixpo/issues).
