---
title: "How we dropped a Notion-style editor into LixSketch using @elixpo/lixeditor"
date: 2026-05-02
tags: [engineering, blocknote, react, npm, lixsketch]
author: "Elixpo team"
description: >
  Sketching alone wasn't enough — every diagram needed a doc next to it. So we
  built `@elixpo/lixeditor`, published it to npm, and shipped it inside LixSketch
  in an afternoon. Here's the integration story, the bugs we hit, and why it's
  one package we'll happily keep maintaining.
---

# How we dropped a Notion-style editor into LixSketch using `@elixpo/lixeditor`

LixSketch is an infinite-canvas drawing tool. People kept asking for one thing:
*"Can I write next to my diagram?"* Adding a full WYSIWYG editor sounded like a
multi-week project. It wasn't — because we'd already built one for the blogs
platform, and we'd published it to npm as
[`@elixpo/lixeditor`](https://www.npmjs.com/package/@elixpo/lixeditor).

This post walks through:

- Why we made `@elixpo/lixeditor` a standalone package
- How we wired it into LixSketch's split-pane canvas
- The not-so-obvious bugs we hit (and how we fixed them)
- What the package gives you out of the box

If you're integrating it yourself, the [README on npm](https://www.npmjs.com/package/@elixpo/lixeditor)
is the canonical reference; this is the *we tried it, here's what happened* version.

---

## Why a standalone package?

The editor first lived inside [blogs.elixpo](https://blogs.elixpo.com) as part
of the post composer. When we needed it inside LixSketch we had three choices:

1. **Copy-paste the source.** Fast today, painful tomorrow. Two divergent
   forks of a complex editor.
2. **Move it into a private workspace package.** Better. But blogs and sketch
   are separate repos with separate deploy pipelines, so a workspace dep means
   manual sync.
3. **Publish to npm.** A single source of truth. Both apps consume the same
   semver-pinned version. Fixes ship to both via a version bump.

We went with option 3. The package lives in
[`blogs.elixpo/packages/lixeditor`](https://github.com/elixpo/blogs.elixpo/tree/main/packages/lixeditor)
and gets published by a GitHub Actions workflow on every merge that touches it.

```yaml
# .github/workflows/publish-npm.yml (excerpt)
on:
  push:
    branches: [main]
    paths: ['packages/lixeditor/**']
```

The workflow auto-bumps the patch version when local matches what's on npm and
commits the bump back as the **elixpoo** CI bot — so we never ship a "version
already published" 403.

---

## Installing it

```bash
npm install @elixpo/lixeditor
# Peer deps the package needs you to provide:
npm install @blocknote/core @blocknote/react @blocknote/mantine \
  @mantine/core @mantine/hooks
```

The peer-deps list is the price of building on top of
[BlockNote](https://www.blocknotejs.org/) and Mantine — they're battle-tested,
actively maintained, and we'd rather lean on them than ship our own primitive
text engine. Mantine 8 + React 19 means you may need `--legacy-peer-deps`
during install while the wider ecosystem catches up.

## Mounting the editor

This is the entire integration in our docs panel:

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

Three CSS imports, one provider, one component. Everything else — block
styles, slash menu, formatting toolbar, keyboard shortcuts, KaTeX rendering,
Mermaid block, Shiki-highlighted code blocks — is bundled.

---

## Real fixes for real bugs

Listing this honestly because *every* integration hits some friction. Here's
what we ran into and what the fixes looked like.

### 1. The slash menu duplicated group headers

Typing `/eq` produced something like:

```
Advanced
Advanced
Advanced
∑ Block Equation — LaTeX block equation
```

Three "Advanced" group labels. The cause: BlockNote's
`SuggestionMenu` emits a group label whenever the iterated item's `group`
changes. It assumes items are pre-sorted by group. Our custom items
(equation, mermaid, ToC, date) interleaved with defaults, so groups switched
back and forth and produced multiple `<Label key={group}>` children — also
emitting React's "two children with the same key" warning.

The fix is in the package now: we use BlockNote's own
[`filterSuggestionItems`](https://www.blocknotejs.org/docs/react/components/suggestion-menus)
helper and **stable-sort by group order** before returning. Items in the same
group are now contiguous, headers render once, no more phantom rows.

### 2. Block equations rendered as plain text

KaTeX needs its CSS. The first published version assumed consumers would
import `katex/dist/katex.min.css` themselves. They didn't. We
`@import` it inside `src/styles/index.css` and let esbuild bundle it into
`dist/styles/index.css`. Consumers now get equation rendering for free from a
single `import '@elixpo/lixeditor/styles'`.

### 3. CSS scoped to the wrong wrapper

Internal styles were originally scoped to `.blog-editor-wrapper` — a class
that only existed in blogs.elixpo. The package's own wrapper is
`.lix-editor-wrapper`. Consumers outside blogs got an unstyled editor. A bulk
rename + a CI smoke-test against sketch.elixpo caught it before the next
publish.

### 4. The side menu (`+` and drag handle) clipped on narrow panes

In a split-pane layout the editor lives in ~40% of the viewport. BlockNote
positions the side menu via [Floating UI](https://floating-ui.com/) at
`left = block.left - menu.width`, which puts it in the block's negative-x
space. With our split-pane host's `overflow-y: auto` (which forces
`overflow-x` to clip), the icons disappeared. Two-part fix:

- Pad the inner `.lix-editor-wrapper` (not the outer scroll container) so
  the side menu's computed `left` lands in positive coordinates.
- Stack `+` and drag-handle vertically (consumer-side CSS), since at
  narrow widths a horizontal row didn't fit.

The package will eventually ship a `sideMenuLayout="vertical"` option so you
don't need to override; for now it's a 12-line CSS block.

### 5. Theme bleed

`LixThemeProvider` writes `data-theme="dark"` (or `"light"`) to
`document.documentElement` and persists to `localStorage`. Make sure you
either:

- Pick a `storageKey` distinct from any other apps on the same origin (we
  use `lixsketch_doc_theme`).
- Or scope the editor inside its own iframe / portal if your app has its own
  theme system.

We hit it the first time because both blogs.elixpo and sketch.elixpo run
on `*.elixpo.com` — without an explicit `storageKey`, the editor in
sketch picked up the user's blogs theme.

---

## What you get out of the box

- **Block markdown shortcuts** — `# `, `## `, `> `, `--- `, `1. `, `[] `
- **Inline markdown** — `**bold**`, `*italic*`, `` `code` ``, link auto-paste
- **Code blocks** — Shiki-highlighted, language picker, dozens of langs
- **LaTeX** — `/eq` for block, `/$` for inline, KaTeX renders both
- **Mermaid diagrams** — `/diagram`, click to edit, full Mermaid 11 syntax
- **Tables, callouts, toggles, checklists** — defaults from BlockNote
- **Keyboard shortcuts modal** — built-in `?` panel
- **Date chip** — `Ctrl+D` inserts today's date
- **Custom theme via CSS variables** — all `--bn-colors-*` are overridable

Disable any of these via the `features` prop:

```jsx
<LixEditor features={{ equations: false, mermaid: false }} />
```

---

## What we'd build differently next time

- **Ship the side-menu-vertical option in v1.** Stacking `+` and drag-handle
  in a column is what 90% of split-pane consumers want.
- **Make CSS variables the only theming surface.** We still expose a few
  hardcoded colors that overrides have to layer through `!important`.
- **Smaller default bundle.** Mermaid and KaTeX are heavy. The next minor
  will lazy-load them per block — no Mermaid tree loaded if no diagram
  exists.

---

## How LixSketch uses it today

Open any canvas, hit the **Split** toggle in the header, and the editor is
right there. Type `# Heading`, drop a `/diagram`, paste a `https://` URL to
auto-link. Save runs once for both the canvas and the doc — same encrypted
session key, same Cloudflare D1 backing store.

Source for the integration:

- [`src/components/docs/DocsPanel.jsx`](https://github.com/elixpo/lixsketch/blob/main/src/components/docs/DocsPanel.jsx)
  — mount + theme + onChange wiring
- [`src/components/docs/docs-theme.css`](https://github.com/elixpo/lixsketch/blob/main/src/components/docs/docs-theme.css)
  — sketch-side theme overrides (vertical side-menu, code-block contrast, etc.)
- [`src/hooks/useDocAutoSave.js`](https://github.com/elixpo/lixsketch/blob/main/src/hooks/useDocAutoSave.js)
  — dual-write (localStorage buffer + cloud) with 409 conflict detection

---

## Try it yourself

```bash
npm install @elixpo/lixeditor
```

[`@elixpo/lixeditor` on npm →](https://www.npmjs.com/package/@elixpo/lixeditor)

It's MIT-licensed inside the lixblogs monorepo, actively maintained, and
shipped with both a blog platform and a canvas tool already eating their own
dog food. If you find a bug we'd much rather hear about it than not — open an
issue on
[`elixpo/blogs.elixpo`](https://github.com/elixpo/blogs.elixpo/issues) with
the `lixeditor` label.
