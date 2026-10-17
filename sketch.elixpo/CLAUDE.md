# CLAUDE.md - LixSketch Project Guide

## Project Overview

**LixSketch** is an open-source alternative to [app.eraser.io](https://app.eraser.io), combining:
1. **Sketch Canvas** - Excalidraw-like infinite canvas drawing (SVG-based, hand-drawn aesthetic)
2. **Docs Editor** - Notion-like WYSIWYG block editor with live markdown support
3. **Collaboration** (planned) - Real-time multi-user editing

## Tech Stack

- **Frontend:** Vanilla JS (ES6 modules), no framework
- **Canvas:** SVG-based with RoughJS (hand-drawn look) + Perfect-Freehand (pressure-sensitive strokes)
- **Docs Editor:** Contenteditable div with custom block/inline markdown parsing
- **Backend:** Node.js + Express 5 (icon search API on port 3002)
- **Storage:** Redis (icon caching), no persistence for sketches/docs yet
- **Dev Server:** lite-server (BrowserSync) with proxy to backend
- **Other libs:** Fabric.js, Konva.js, Paper.js, Highlight.js, Fuse.js, Boxicons, Ionicons

## Project Structure

```
/                           # Root
  index.html                # Main sketch app (single page, ~536 lines)
  language_detect.html      # Standalone code highlighting demo (not integrated)
  package.json              # Node config, scripts: dev, frontend, backend
  bs-config.json            # lite-server config (proxy /api -> :3002)
  aims                      # Dev goals (markdown features)
  pending                   # Feature TODO checklist
  pendingRem.txt            # Additional pending items
  error                     # Recent crash log (heap exhaustion)
  planning.tldr             # Binary planning file

/JS/                        # Sketch canvas modules (~24 files)
  sketchGeneric.js          # Global state, tool flags, sidebar/toolbar init
  eventListeners.js         # Central event dispatcher (mousedown/move/up -> tools)
  imports.js                # CDN imports (RoughJS, Perfect-Freehand)
  canvasStroke.js           # Freehand brush tool with pressure sensitivity
  drawSquare.js             # Rectangle tool (stroke, fill, patterns)
  drawCircle.js             # Circle/ellipse tool
  drawArrow.js              # Arrow tool with connection points (~78KB)
  lineTool.js               # Straight/curved line tool
  writeText.js              # Text placement and editing
  writeCode.js              # Code blocks with syntax highlighting (~81KB)
  imageTool.js              # Image insertion
  icons.js                  # Icon search + insertion via API (~54KB)
  frameHolder.js            # Frame/artboard grouping (~47KB)
  selection.js              # Multi-select, drag, resize, rotate (~54KB)
  eraserTool.js             # Eraser
  eraserTrail.js            # Eraser visual trail
  laserTool.js              # Laser pointer tool
  undoAndRedo.js            # Undo/redo stack (~55KB)
  zoomFunction.js           # Zoom (0.4x - 30x) + pan controls
  panCanvas.js              # Hand/pan tool
  resizeShapes.js           # Shape resize utils
  resizeCode.js             # Code block resize
  copyAndPaste.js           # Copy/paste (Ctrl+C/V)
  Canvas.js                 # Minimal/unused canvas setup

/CSS/                       # Stylesheets (~11 files)
  canvasTools.css           # Main toolbar, icons, zoom controls
  canvasStroke.css           # Brush stroke styles
  menu.css                  # Settings/menu popup
  squareSidebar.css         # Rectangle properties panel
  circleSidebar.css         # Circle properties panel
  lineSidebar.css           # Line properties panel
  arrowSidebar.css          # Arrow properties panel
  paintbrushSidebar.css     # Brush properties panel
  textToolBar.css           # Text tool properties
  writeText.css             # Text editing styles
  docsRecreate.css/2.css    # Legacy docs styles

/docs/                      # Notion-like markdown editor (separate app)
  index.html                # Editor HTML (contenteditable, toolbar)
  docs.css                  # Dark theme editor styles
  JS/
    docsControls.js         # Toolbar events, block/inline style application (~45KB)
    docsEventListeners.js   # Keyboard/mouse events for editor (~23KB)
    docsGeneral.js          # Utilities, table creation, ID gen (~13KB)
    docsBlockMarkdown.js    # Block markdown parsing (H1-H5, code, tables, lists)
    docsInlineMarkdown.js   # Inline markdown (bold, italic, strikethrough, marks)
    blockCompatibility.js   # Block element compatibility checks (~17KB)
    docsLanguageSelector.js # Code block language selector UI
    docsTableMaker.js       # Table creation/manipulation

/api/
  iconsFetcher.js           # Express server: /search, /serve, /feed endpoints

/ICONS_CONT/                # Icon library (~258MB, with info/icons.json metadata)
/FONT/                      # Custom fonts (lixCode, lixFont)
/Images/                    # App assets (logo, etc.)
/snippetFormats/            # Math notation templates (line/arrow math HTML)
/pythonFetch/               # Legacy Python script (unused)
```

## Architecture Notes

### State Management
- Global state lives in `sketchGeneric.js` (boolean tool flags, current shape, selected elements)
- Shapes stored in a global `shapes` array
- Undo/redo uses action-based history stacks
- No centralized state store; cross-module communication via shared globals and exports

### Canvas Architecture
- SVG-based rendering (not HTML5 Canvas despite the name)
- Each shape is a class instance (Rectangle, Circle, Arrow, Text, etc.)
- Event flow: `eventListeners.js` dispatches mouse events -> tool-specific handlers
- Tools activated by boolean flags (isPaintToolActive, isSquareToolActive, etc.)
- Properties panels show/hide based on active tool

### Docs Editor Architecture
- Block-based contenteditable editor
- Markdown shortcuts auto-convert (e.g., "# " -> H1, "TABLE " -> table)
- Block types: paragraph, headings (H1-H5), code blocks, tables, lists, blockquotes
- Inline formats: bold, italic, strikethrough, underline, highlight, inline code

## Running the Project

```bash
npm install
npm run dev          # Runs backend + frontend concurrently
npm run frontend     # Frontend only (lite-server on default port)
npm run backend:dev  # Backend only (nodemon, port 3002)
```

## Code Conventions

- **JS:** ES6 modules with import/export, camelCase for vars/functions, PascalCase for classes
- **CSS:** ID-based and class-based selectors, no CSS framework
- **HTML:** Data attributes (`data-id`) for config, IDs for element targeting
- **No build step** - static frontend served directly
- **No TypeScript** - all vanilla JS
- **No testing framework** - no tests exist yet
- **No linter/formatter** configured

## Known Issues

1. **Memory leak** in icon API (Node.js heap exhaustion - see `error` file)
2. **No persistence** - drawings and docs are lost on reload
3. **No collaboration** - single-user only
4. **No mobile/touch support** - mouse events only
5. **Large monolithic files** - several files exceed 50KB
6. **Unused code** - `Canvas.js`, `language_detect.html`, `pythonFetch/`
7. **No error handling** in many places
8. **Global state fragility** - tool flags can conflict

## Arrow Attachment Architecture

Arrows store references to shape **wrapper objects** (not DOM elements). All shape types (rect, circle, text, code, image, icon, freehand, line, frame) support arrow attachment via:
- `findNearbyShape()` in drawArrow.js dispatches by `shape.shapeName`
- `calculateAttachedPoint()` recalculates position when shape moves
- `updateAttachedArrows()` global function accepts either wrapper or DOM element (does lookup)
- Each shape class has an instance `updateAttachedArrows()` method that calls the global one with `this`
- `cleanupAttachments()` handles detaching arrows when any shape is deleted

## Pending Features (from project files)

- Save/load sketches (localStorage/IndexedDB/server)
- Real-time collaboration (WebSocket)
- Export (PNG, SVG, PDF)
- Zen/focus mode
- Command palette / help system
- Canvas lock
- Text-to-diagram conversion
- Shape properties panel improvements
- Mobile/touch support
- Authentication/user system

## Guidelines for Development

- Keep vanilla JS approach unless major refactor is agreed upon
- Each tool should be its own module with clear exports
- Minimize global state; prefer passing state through function params
- Dark theme is primary; support light theme via CSS custom properties
- The sketch and docs editors are separate apps but should share navigation
- Test changes in both Chrome and Firefox at minimum
- When adding features, update the relevant pending/aims files
