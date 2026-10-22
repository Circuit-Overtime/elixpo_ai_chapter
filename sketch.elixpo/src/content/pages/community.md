# Community

LixSketch is **fully open source** — built by developers, for developers. Every line of code is public, every feature ships in the open, and every contribution matters.

## Get Involved

There's no gated community, no Discord paywall, no waitlist. The entire project lives on GitHub.

- **Star the repo** — it helps others discover LixSketch
- **Fork and contribute** — PRs are welcome, from typo fixes to major features
- **Open issues** — bug reports, feature requests, and questions all welcome
- **Discuss ideas** — use GitHub Discussions for design conversations

## How to Contribute

### 1. Pick Something to Work On

Browse the open issues on GitHub. Look for labels like `good first issue`, `help wanted`, or `enhancement`. Or just scratch your own itch — if you want a feature, build it.

### 2. Fork and Clone

```bash
git clone https://github.com/anthropics/lixsketch.git
cd lixsketch
npm install
npm run dev
```

The dev server runs the Next.js frontend and the backend concurrently. Changes hot-reload instantly.

### 3. Make Your Changes

Follow the existing code conventions:

- **Vanilla JS** with ES6 modules for the canvas engine
- **React** (Next.js) for the landing pages and app shell
- **No TypeScript** — the project uses plain JS throughout
- **camelCase** for variables and functions, **PascalCase** for classes
- **No build step** for the canvas engine — static files served directly

### 4. Submit a PR

Push your branch and open a pull request. Describe what you changed and why. Screenshots or screen recordings are especially helpful for UI changes.

## Project Structure

The codebase is organized into clear modules:

- **Canvas engine** — SVG-based drawing tools in `/src/engine/`
- **Landing & pages** — Next.js app in `/src/app/`
- **Collaboration** — Cloudflare Worker + Durable Objects in `/worker/`
- **Docs editor** — Notion-like block editor in `/docs/`
- **LixScript** — diagram DSL parser in `/src/engine/core/`

```lixscript
// Project Structure
$blue = #4A90D9
$green = #2ECC71
$purple = #9B59B6
$orange = #E67E22
$gray = #e0e0e0

rect app at 200, 30 size 160x50 {
  stroke: $blue
  label: "Next.js App"
}

rect engine at 60, 150 size 140x50 {
  stroke: $green
  label: "Canvas Engine"
}

rect worker at 200, 150 size 140x50 {
  stroke: $purple
  label: "CF Worker"
}

rect docs at 340, 150 size 140x50 {
  stroke: $orange
  label: "Docs Editor"
}

rect lixscript at 60, 270 size 140x50 {
  stroke: $green
  label: "LixScript DSL"
}

rect collab at 200, 270 size 140x50 {
  stroke: $purple
  label: "Durable Objects"
}

rect sharing at 340, 270 size 140x50 {
  stroke: $orange
  label: "E2E Sharing"
}

arrow a1 from app.bottom to engine.top {
  stroke: $gray
}

arrow a2 from app.bottom to worker.top {
  stroke: $gray
}

arrow a3 from app.bottom to docs.top {
  stroke: $gray
}

arrow a4 from engine.bottom to lixscript.top {
  stroke: $gray
}

arrow a5 from worker.bottom to collab.top {
  stroke: $gray
}

arrow a6 from docs.bottom to sharing.top {
  stroke: $gray
}
```

## What You Can Contribute

### Canvas Tools
Add new shape types, improve selection behavior, build new property controls, or optimize rendering performance.

### LixScript
Extend the DSL with new shape types, layout algorithms, or styling options. The parser is in `/src/engine/core/LixScriptParser.js`.

### Docs Editor
Improve the Notion-like block editor — better markdown parsing, new block types, table improvements, or inline formatting.

### Landing Pages
Design and build new pages, improve animations, or polish the responsive layout.

### Bug Fixes
Every bug you fix makes the tool better for everyone. Check the issue tracker for reported bugs.

### Documentation
Write tutorials, improve the getting started guide, or add inline code comments to complex modules.

## Code of Conduct

Be kind. Be constructive. Assume good intent. We're all here to build something useful.

- **Be respectful** in issues, PRs, and discussions
- **Give context** when reporting bugs — steps to reproduce, browser, OS
- **Be patient** with maintainers — this is an open source project
- **Help others** who are getting started

## License

LixSketch is open source. Use it, modify it, deploy it, learn from it. The code is yours to build on.

## Stay Connected

The best way to stay updated is to **watch the repo** on GitHub. You'll get notified of new releases, discussions, and important changes.

If you build something cool with LixSketch — a diagram, a workflow, an integration — share it. Open a discussion, tweet about it, or open a PR to add it to the examples.
