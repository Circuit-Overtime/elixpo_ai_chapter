# How to Start with LixSketch

LixSketch is a zero-setup canvas. Open the app, pick a tool, and start drawing. No account required, no paywall, no install.

## Opening a Canvas

Visit the homepage and click **Start Drawing**. You'll get a fresh canvas with a unique URL like `/c/lx-abc123-xyz`. Bookmark it or share it — that URL is your canvas.

You can also go directly to any canvas URL. Each canvas is independent.

## The Toolbar

The toolbar sits on the left side of the canvas. Here are the tools available:

- **Select** (V) — click to select, drag to multi-select, resize and rotate
- **Pan** (H) — drag the canvas to move around
- **Rectangle** (R) — draw rectangles with hand-drawn style
- **Circle** (C) — draw circles and ellipses
- **Line** (L) — draw straight or curved lines
- **Arrow** (A) — draw arrows that snap to shapes
- **Freehand** (P) — pressure-sensitive brush strokes
- **Text** (T) — click to place text on the canvas
- **Code** — insert syntax-highlighted code blocks
- **Image** — drag an image onto the canvas or click to upload
- **Icon** — search and insert from 250K+ icons
- **Frame** — group elements into named artboards
- **Eraser** (E) — brush over elements to delete them
- **Laser** — temporary highlight for presentations

## Drawing Shapes

Select a shape tool and click-drag on the canvas. All shapes render with a **hand-drawn aesthetic** powered by RoughJS.

After drawing, you can:

- **Resize** by dragging corner handles
- **Move** by dragging the shape
- **Rotate** by dragging the rotation handle
- **Change properties** in the sidebar (color, stroke width, fill, roughness)

```lixscript
// Basic Shapes
$blue = #4A90D9
$green = #2ECC71
$purple = #9B59B6
$gray = #e0e0e0

rect box at 50, 50 size 120x80 {
  stroke: $blue
  label: "Rectangle"
}

circle dot at 280, 90 size 80x80 {
  stroke: $green
  label: "Circle"
}

rect tall at 430, 40 size 80x110 {
  stroke: $purple
  label: "Tall Rect"
}
```

## Smart Arrows

Arrows are the most powerful connector in LixSketch. They **auto-attach** to shapes and follow them when moved.

1. Select the **Arrow** tool (A)
2. Click on the edge of a shape — the arrow snaps to the nearest anchor point
3. Drag to another shape — it snaps to that shape too
4. Move either shape — the arrow follows automatically

Arrows support labels, custom colors, and stroke styles. They attach to all shape types: rectangles, circles, text, code blocks, images, icons, and frames.

```lixscript
// Arrow Connections
$blue = #4A90D9
$green = #2ECC71
$gray = #e0e0e0

rect api at 50, 80 size 130x50 {
  stroke: $blue
  label: "API Server"
}

rect db at 260, 80 size 130x50 {
  stroke: $green
  label: "Database"
}

rect cache at 260, 200 size 130x50 {
  stroke: $blue
  label: "Redis Cache"
}

arrow a1 from api.right to db.left {
  stroke: $gray
  label: "Query"
}

arrow a2 from api.bottom to cache.left {
  stroke: $gray
  label: "Cache Hit"
}
```

## Text and Code Blocks

### Text
Select the **Text** tool (T) and click anywhere on the canvas. Type your text — it renders in **lixFont** with the hand-drawn aesthetic. You can change the font, size, color, and alignment from the toolbar that appears.

### Code Blocks
Click the **Code** tool and place a code block. Type or paste your code — it automatically gets syntax highlighting with language auto-detection. Code blocks use the **lixCode** monospace font and support resizing.

## Keyboard Shortcuts

LixSketch is designed for keyboard-first workflows:

- **V** — Select tool
- **H** — Pan / Hand tool
- **R** — Rectangle
- **C** — Circle
- **L** — Line
- **A** — Arrow
- **P** — Pencil / Freehand
- **T** — Text
- **E** — Eraser
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** — Redo
- **Ctrl+C / Ctrl+V** — Copy / Paste
- **Ctrl+A** — Select all
- **Delete / Backspace** — Delete selected
- **Ctrl+D** — Duplicate
- **Scroll wheel** — Zoom in/out
- **Space + drag** — Pan

## Sharing a Canvas

Click the **Share** button in the toolbar. Your canvas is encrypted in the browser using **AES-GCM 256-bit** encryption, and a share link is generated.

The encryption key lives in the URL fragment (`#key=...`), which is never sent to the server. Only people with the full link can view or edit your canvas.

You can set permissions:

- **View only** — recipients can see but not edit
- **Edit** — recipients can modify the canvas

## Collaborating in Real Time

Share a canvas link with teammates and draw together live. You'll see:

- **Live cursors** — see where others are pointing
- **Real-time edits** — shapes appear as they're drawn
- **No conflicts** — changes are synced instantly via WebSocket

Collaboration uses **Cloudflare Durable Objects** for low-latency, globally distributed rooms.

## Exporting Your Work

Click the **Export** button to save your canvas:

- **PNG** — rasterized image, great for docs and presentations
- **SVG** — vector format, preserves the hand-drawn aesthetic

## Using LixScript

For programmatic diagram creation, use **LixScript** — a declarative DSL built into LixSketch.

Open the AI/LixScript panel and type commands like:

```lixscript
// Quick Architecture Diagram
$blue = #4A90D9
$green = #2ECC71
$gray = #e0e0e0

rect frontend at 150, 50 size 150x50 {
  stroke: $blue
  label: "Next.js App"
}

rect worker at 150, 170 size 150x50 {
  stroke: $green
  label: "CF Worker"
}

rect db at 150, 290 size 150x50 {
  stroke: $blue
  label: "D1 Database"
}

arrow a1 from frontend.bottom to worker.top {
  stroke: $gray
  label: "REST API"
}

arrow a2 from worker.bottom to db.top {
  stroke: $gray
  label: "SQL Queries"
}
```

The diagram renders instantly on your canvas, and you can move, resize, and edit any generated element.

## Tips

- **Double-click** a shape to edit its text or properties
- **Hold Shift** while drawing to constrain proportions
- **Right-click** for context menu options
- Use **frames** to organize complex diagrams into sections
- **Zoom to fit** with Ctrl+Shift+0
