# Designing LixScript: A DSL for Diagrams

LixScript is the declarative language behind LixSketch's AI-powered diagram generation. It was designed with one goal: make it easy for both humans and LLMs to describe visual layouts.

## Why a Custom DSL?

We evaluated existing options:
- **Mermaid** — great for flowcharts but limited in positioning control
- **PlantUML** — powerful but verbose and complex syntax
- **D2** — modern but requires a separate compiler

None of them gave us what we needed: **fine-grained control over every pixel** while keeping the syntax readable enough for an LLM to generate reliably.

## Design Principles

1. **Positional** — every shape has explicit x,y coordinates and dimensions
2. **Referential** — shapes can reference other shapes' positions (`node1.right + 40`)
3. **Minimal** — properties have sensible defaults; you only specify what you need
4. **Token-efficient** — the LLM spec is ~2.5k tokens, small enough to fit in any system prompt

## The Parser

LixScript parsing happens in three stages:

```lixscript
// LixScript Parser Pipeline
$blue = #4A90D9
$green = #2ECC71
$orange = #E67E22
$gray = #e0e0e0

rect source at 100, 50 size 180x55 {
  stroke: $blue
  label: "LixScript Source"
}

rect tokenize at 100, 160 size 180x55 {
  stroke: $orange
  label: "1. Tokenize"
}

rect resolve at 100, 270 size 180x55 {
  stroke: $orange
  label: "2. Resolve Refs"
}

rect render at 100, 380 size 180x55 {
  stroke: $green
  label: "3. Render Shapes"
}

rect canvas at 100, 490 size 180x55 {
  stroke: $green
  label: "Canvas Output"
}

arrow a1 from source.bottom to tokenize.top {
  stroke: $gray
  label: "Text"
}

arrow a2 from tokenize.bottom to resolve.top {
  stroke: $gray
  label: "AST"
}

arrow a3 from resolve.bottom to render.top {
  stroke: $gray
  label: "Resolved AST"
}

arrow a4 from render.bottom to canvas.top {
  stroke: $gray
  label: "Shape Objects"
}
```

### Stage 1: Tokenize

The source is split into blocks. Each block starts with a shape type keyword (`rect`, `circle`, `arrow`, `text`, `line`, `freehand`, `frame`) and includes properties in curly braces.

Variables (`$name = value`) are expanded inline during this stage.

### Stage 2: Resolve References

Shapes are processed in declaration order. When a shape references another shape's position (e.g., `node1.right + 40`), the referenced shape must already be defined. The resolver calculates:

- `.x`, `.y` — top-left corner
- `.right`, `.bottom` — computed edges
- `.centerX`, `.centerY` — midpoints
- `.width`, `.height` — dimensions

### Stage 3: Render

Each resolved shape is instantiated as a real LixSketch shape object (Rectangle, Circle, Arrow, etc.) and added to the canvas. Arrows auto-attach to their source and target shapes.

## LLM Integration

The compact LLM spec fits in a system prompt and teaches any LLM to generate valid LixScript. The key insight: LLMs are great at generating structured text with clear rules, and LixScript's syntax is intentionally close to CSS/JSON in feel.

## What's Next

We're working on:
- **Auto-layout** — specify relationships without explicit coordinates
- **Loops** — `repeat 5 { ... }` for repetitive structures
- **Templates** — reusable shape groups
- **Import** — compose diagrams from multiple files
