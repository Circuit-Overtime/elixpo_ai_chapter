# LixEditor distribution size guidance

The release workflow reports the unpacked size of `@elixpo/lixeditor` while
retaining its ESM and CommonJS entry points, declarations, granular styles, and
all editor and preview features. Size is reviewed as an optimization signal,
not enforced as a hard release threshold.

Registry metadata sampled on 2026-08-29:

| Package | Unpacked size | Files | Scope |
| --- | ---: | ---: | --- |
| `@elixpo/lixeditor@2.7.15` | 2,277,825 B | 101 | Full LixEditor source, maps, duplicated KaTeX fonts, and builds |
| Optimized LixEditor payload | 237,201 B | 12 | Same ESM/CJS API, declarations, and style exports |
| `@tiptap/react@3.30.5` | 546,810 B | 48 | React bindings for the Tiptap editor |
| `@blocknote/react@0.54.0` | 23,416,939 B | 341 | BlockNote's broader React editor package |

The optimized measurement includes the generated package files before npm's
tar compression. GitHub Actions measures and reports the actual packed artifact
again while continuing to enforce its file and export contracts.

## How the reduction works

- Minify the ESM, CommonJS, and CSS outputs.
- Do not publish source maps or duplicate source files.
- Preserve CSS subpath exports as small minified stylesheets.
- Keep the existing automatic KaTeX stylesheet import, but resolve its fonts
  from the installed `katex` dependency instead of copying them into LixEditor.
- Keep React, BlockNote, Mantine, KaTeX, Mermaid, and Shiki external to the
  first-party JavaScript bundle as before.

No components, blocks, renderer behavior, style rules, module format, or type
declarations may be removed to satisfy the budget.
