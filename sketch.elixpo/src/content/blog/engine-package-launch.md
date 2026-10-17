# Introducing @lixsketch/engine: Build Your Own Whiteboard

We've always believed that the best tools are the ones you can make your own. Today, we're open-sourcing the core of LixSketch as **@lixsketch/engine** — an installable npm package that gives you a full infinite-canvas whiteboard engine in a few lines of code.

## Why a Package?

LixSketch started as a single web app. But as the engine grew — shapes, arrows, undo/redo, zoom/pan, LixScript, freehand strokes, scene serialization — we realized this wasn't just an app. It was a **framework**.

Other projects need whiteboards too: documentation tools, design systems, educational platforms, internal tools. Instead of everyone rebuilding the same SVG manipulation, event handling, and shape math from scratch, we extracted our engine into a clean, framework-agnostic package.

## Getting Started

```bash
npm install @lixsketch/engine
```

Mount on any SVG element:

```javascript
import { createSketchEngine, TOOLS } from '@lixsketch/engine';

const svg = document.querySelector('#my-canvas');
svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);

const engine = createSketchEngine(svg, {
  onEvent: (type, data) => {
    // Wire up your own UI — React, Vue, Svelte, vanilla, anything
    if (type === 'sidebar:select') showProperties(data);
    if (type === 'zoom:change') updateZoomDisplay(data);
  },
});

await engine.init();
engine.setActiveTool(TOOLS.RECTANGLE);
```

That's it. You now have rectangles, circles, arrows, lines, text, code blocks, images, frames, freehand drawing, undo/redo, copy/paste, zoom/pan, and LixScript — all running on your SVG.

## What's Included

- **10 shape classes** — Rectangle, Circle, Arrow, Line, Text, Code, Image, Icon, Frame, FreehandStroke
- **14 drawing tools** — with RoughJS hand-drawn aesthetics and Perfect Freehand pressure-sensitive strokes
- **Scene serialization** — save/load `.lixsketch` JSON, export to PNG/PDF/SVG
- **LixScript DSL** — programmatically create diagrams with code
- **Full undo/redo** — action-based history stack
- **Infinite canvas** — zoom 0.4x to 30x with smooth pan

## What's NOT Included

The engine is deliberately UI-less. No toolbar, no sidebars, no modals. You bring your own UI and wire it up through the `onEvent` callback. This means it works with any framework — or no framework at all.

Also excluded: authentication, cloud storage, collaboration. These are app-level concerns that belong in your app, not the engine.

## The VS Code Extension

Alongside the npm package, we're launching **LixSketch for VS Code**. Open any `.lixsketch` file directly in your editor — draw diagrams, save them alongside your code, and version them with git.

The extension runs entirely offline. No account needed, no cloud sync. Just a whiteboard in your editor.

Install it from the VS Code Marketplace: search for **LixSketch**.

## .lixsketch File Format

Files are fully interoperable. A `.lixsketch` file created on the web app opens in VS Code and vice versa. The format is plain JSON:

```json
{
  "format": "lixsketch",
  "version": 1,
  "name": "My Diagram",
  "shapes": [...]
}
```

Commit them to git, share them in PRs, embed them in documentation.

## What's Next

This is v1.0.0 of the engine. We're planning:

- **Plugin system** — register custom shape types and tools
- **Headless mode** — render scenes server-side without a DOM (for thumbnails, OG images)
- **TypeScript types** — `.d.ts` definitions for the full API
- **More export formats** — Mermaid, PlantUML, draw.io XML

Check out the [npm package](https://www.npmjs.com/package/@lixsketch/engine) and the [GitHub repo](https://github.com/elixpo/elixposketch).

Build something cool. We can't wait to see it.
