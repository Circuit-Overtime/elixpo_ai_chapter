# LixSketch Roadmap

LixSketch is built in public. Here's what we've shipped, what we're working on, and where we're headed.

## What We've Built

### Canvas Engine

The core drawing engine is fully functional with a hand-drawn aesthetic powered by **RoughJS** and pressure-sensitive strokes via **Perfect-Freehand**.

- **Shape tools** — rectangles, circles, ellipses, lines, arrows, freehand brush
- **Text tool** — multi-line text with font selection (lixFont, lixDefault, lixFancy, lixCode)
- **Code blocks** — syntax-highlighted code on canvas with language auto-detection
- **Smart arrows** — auto-attach to shapes and follow them when moved
- **Selection system** — multi-select, drag, resize, rotate
- **Zoom & pan** — 0.4x to 30x with smooth controls
- **Undo/redo** — full action-based history stack
- **Copy/paste** — Ctrl+C/V for duplicating elements
- **Image tool** — drag-and-drop or click to insert images
- **Icon library** — searchable icon set with 250K+ icons
- **Frame tool** — group elements into artboards
- **Eraser** — remove elements with a brush stroke
- **Laser pointer** — for presentations and walkthroughs

### LixScript DSL

A custom **declarative scripting language** for generating diagrams from text:

- Define shapes with `rect`, `circle`, `ellipse`
- Connect with `arrow` using directional anchors
- Style with variables (`$color = #hex`)
- Position with `at x, y` coordinates
- Label with `label: "text"`

### E2E Encrypted Sharing

- **AES-GCM 256-bit** encryption in the browser
- Key stored in URL fragment — never hits the server
- Share with view or edit permissions
- Zero-knowledge server architecture

### Real-Time Collaboration

- **WebSocket** rooms via Cloudflare Durable Objects
- Live cursor sharing between participants
- Scene state sync with conflict-free updates
- Ephemeral rooms — no data persisted after disconnect

### Export

- **PNG export** — rasterized canvas output
- **SVG export** — vector output preserving the hand-drawn look

### AI Diagram Generation

- Describe diagrams in plain text or LixScript
- AI generates the diagram layout automatically
- Integrates directly into the canvas

```lixscript
// Architecture Overview
$blue = #4A90D9
$green = #2ECC71
$purple = #9B59B6
$orange = #E67E22
$gray = #e0e0e0

rect canvas at 200, 50 size 180x50 {
  stroke: $blue
  label: "Canvas Engine"
}

rect collab at 60, 170 size 150x50 {
  stroke: $green
  label: "Collaboration"
}

rect sharing at 200, 170 size 150x50 {
  stroke: $purple
  label: "E2E Sharing"
}

rect lixscript at 340, 170 size 150x50 {
  stroke: $orange
  label: "LixScript"
}

rect export at 60, 290 size 150x50 {
  stroke: $blue
  label: "Export"
}

rect ai at 340, 290 size 150x50 {
  stroke: $green
  label: "AI Generation"
}

arrow a1 from canvas.bottom to collab.top {
  stroke: $gray
}

arrow a2 from canvas.bottom to sharing.top {
  stroke: $gray
}

arrow a3 from canvas.bottom to lixscript.top {
  stroke: $gray
}

arrow a4 from collab.bottom to export.top {
  stroke: $gray
}

arrow a5 from lixscript.bottom to ai.top {
  stroke: $gray
}
```

## In Progress

These features are actively being developed:

### Command Palette
A keyboard-first interface (`Cmd+K` / `Ctrl+K`) to search tools, actions, and recent canvases without touching the mouse.

### Improved Properties Panel
Richer shape properties — gradients, opacity, shadow, border-radius controls, and pattern fills.

### Docs Editor Integration
Connecting the Notion-like docs editor with the canvas so you can embed live diagrams in documents.

## Planned

### Persistence & Accounts
- **Save to cloud** — canvases persist across sessions
- **User accounts** — optional sign-in for canvas management
- **Workspace dashboard** — organize canvases into projects
- **Version history** — browse and restore previous versions

### Team Workspaces
- **Shared team canvases** — invite members to a workspace
- **Role-based permissions** — owner, editor, viewer
- **Team library** — shared components and templates
- **Activity feed** — see who edited what and when

### Advanced Canvas Features
- **Connectors** — bezier curves between any two points
- **Tables on canvas** — spreadsheet-like grids
- **Sticky notes** — quick ideation elements
- **Shape libraries** — pre-built UI components, AWS icons, flowchart shapes
- **Canvas lock** — prevent accidental edits
- **Infinite nested frames** — frames within frames

### Mobile & Touch
- **Touch gestures** — pinch to zoom, two-finger pan
- **Responsive toolbar** — adapted for smaller screens
- **Stylus support** — pressure sensitivity on tablets

### Integrations
- **GitHub** — embed diagrams in issues and PRs
- **Notion** — live diagram embeds
- **Slack** — share canvas previews
- **VS Code extension** — diagram alongside your code

## Changelog

### March 2026
- Shipped **AI diagram generation** via LixScript
- Added **E2E encrypted sharing** with URL fragment keys
- Launched **real-time collaboration** with Durable Objects
- Released **LixScript DSL** with parser and preview
- Added **PNG and SVG export**

### February 2026
- Built **smart arrow attachments** with shape tracking
- Added **frame tool** for artboard grouping
- Shipped **icon library** with search API
- Implemented **code blocks** with syntax highlighting

### January 2026
- Core canvas engine with RoughJS rendering
- Basic shape tools (rect, circle, line, freehand)
- Text tool with font selection
- Zoom, pan, and selection system
- Undo/redo history stack

## Contributing

LixSketch is open source. If there's a feature you want to see, you can:

- **Open an issue** on GitHub with a feature request
- **Submit a PR** for features you'd like to build
- **Join the discussion** on GitHub Discussions
- **Report bugs** — every fix makes the tool better for everyone
