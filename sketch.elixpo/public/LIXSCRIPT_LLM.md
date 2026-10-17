# LixScript LLM Reference

> Dense reference for AI code generation. Copy this into your system prompt.

## Critical Rules

1. Output ONLY valid LixScript. No markdown, no explanation.
2. Shapes must NEVER overlap. Use generous spacing: **150px vertical, 250px horizontal minimum** between shape edges.
3. Every shape must be large enough for its label: **min 200x65 for rects, 110x110 for circles**. Scale up ~20px per extra word.
4. Use `curve: curved` for any arrow that isn't straight-down or sideways. Always curve backward/retry arrows.
5. Use relative positioning (`node1.bottom + 150`) not absolute coordinates for 2nd+ shapes. Chained references are supported (A→B→C→D).
6. Connect all shapes with arrows — no orphans.
7. Start first shape at **(200, 60)**. Use bright stroke colors only — no dark colors (#333, #000).

## Syntax

```
// Comments
$var = value                              // Variables

rect <id> at <x>, <y> size <w>x<h> { }   // Rectangle
circle <id> at <x>, <y> size <w>x<h> { } // Circle/Ellipse
arrow <id> from <src> to <tgt> { }        // Arrow
line <id> from <src> to <tgt> { }         // Line (no head)
text <id> at <x>, <y> { }                // Text label
frame <id> at <x>, <y> size <w>x<h> { }  // Container
```

## Properties

### rect / circle
| Property | Values | Default |
|----------|--------|---------|
| stroke | color | #fff |
| strokeWidth | number | 2 |
| fill | color | transparent |
| fillStyle | none/solid/hachure/cross-hatch/dots | none |
| roughness | 0-3 | 1.5 |
| style | solid/dashed/dotted | solid |
| label | "text" | — |
| labelColor | color | #e0e0e0 |
| labelFontSize | number | 14 |

### arrow
| Property | Values | Default |
|----------|--------|---------|
| stroke | color | #fff |
| style | solid/dashed/dotted | solid |
| curve | straight/curved/elbow | straight |
| curveAmount | number | 50 |
| label | "text" | — |
| labelColor | color | #e0e0e0 |

### text
| Property | Values | Default |
|----------|--------|---------|
| content | "text" (required) | — |
| color | color | #fff |
| fontSize | number | 16 |
| anchor | start/middle/end | middle |

### frame
| Property | Values | Default |
|----------|--------|---------|
| name | "text" | id |
| stroke | color | #555 |
| contains | id1, id2 | all shapes |

## Connections

```
arrow a1 from shapeA.bottom to shapeB.top { }   // shape.side
arrow a2 from shapeA to shapeB { }               // center
arrow a3 from 100, 200 to 300, 400 { }           // coordinates
arrow a4 from shapeA.right + 10 to shapeB.left { } // with offset
```

Sides: `top`, `bottom`, `left`, `right`, `center`

## Relative Positioning

```
rect b at a.right + 250, a.y size 200x65 { }     // right of a
rect c at a.x, a.bottom + 150 size 200x65 { }    // below a
```

Refs: `id.x`, `id.y`, `id.right`, `id.bottom`, `id.left`, `id.top`, `id.centerX`, `id.centerY`, `id.width`, `id.height`

## Layout Guide

### Shape Sizing
| Label Length | Rect Size | Circle Size |
|-------------|-----------|-------------|
| 1-2 words | 200x65 | 110x110 |
| 3-4 words | 240x70 | 130x130 |
| 5+ words | 300x75 | 150x150 |

### Spacing
- Vertical (top→down): 150px gap between shapes
- Horizontal (left→right): 250px gap between shapes
- Start first shape at (200, 60)

### Arrow Routing
- Straight down → `curve: straight` (default)
- Sideways/diagonal → `curve: curved`
- Backward/loop → `curve: curved` + `style: dashed`

## Color Palette (dark canvas #1a1a2e)
```
$blue = #4A90D9    // processes
$green = #2ECC71   // success
$red = #E74C3C     // errors
$amber = #F39C12   // warnings
$purple = #9B59B6  // external
$teal = #1ABC9C    // data
$gray = #e0e0e0    // neutral
```

NEVER use dark colors (#333, #000) — invisible on dark canvas.

## Example

```lixscript
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$gray = #e0e0e0

rect login at 200, 60 size 200x65 {
  stroke: $blue
  label: "Login Page"
}

rect validate at login.x, login.bottom + 150 size 260x70 {
  stroke: $blue
  label: "Validate Credentials"
}

circle decision at validate.x, validate.bottom + 150 size 110x110 {
  stroke: $red
  label: "Valid?"
}

rect dashboard at decision.x, decision.bottom + 150 size 200x65 {
  stroke: $green
  label: "Dashboard"
}

rect error at decision.right + 250, decision.y size 200x65 {
  stroke: $red
  label: "Show Error"
}

arrow a1 from login.bottom to validate.top {
  stroke: $gray
  label: "Submit"
}

arrow a2 from validate.bottom to decision.top {
  stroke: $gray
}

arrow a3 from decision.bottom to dashboard.top {
  stroke: $green
  label: "Yes"
}

arrow a4 from decision.right to error.left {
  stroke: $red
  curve: curved
  label: "No"
}

arrow a5 from error.top to login.right {
  stroke: $red
  curve: curved
  style: dashed
  label: "Retry"
}
```

Frame is auto-created around all shapes — no need to define one.
