# LixScript Language Reference

LixScript is a declarative DSL for programmatically creating diagrams in LixSketch. Write code to define shapes, connections, and layouts with full control over every property.

## Quick Start

```lixscript
// A simple flowchart
rect start at 200, 60 size 200x65 {
  stroke: #4A90D9
  label: "Start"
}

rect end at start.x, start.bottom + 150 size 200x65 {
  stroke: #2ECC71
  label: "End"
}

arrow a1 from start.bottom to end.top {
  stroke: #e0e0e0
}
```

## Syntax Overview

### Comments

```lixscript
// This is a comment
rect myShape at 100, 100 size 100x50 // inline comment
```

### Variables

Define reusable values with `$name = value`. Variables can hold colors, numbers, or strings.

```lixscript
$primary = #4A90D9
$secondary = #2ECC71
$nodeWidth = 160
$nodeHeight = 60

rect box1 at 100, 100 size 160x60 {
  stroke: $primary
}
```

Variables are resolved at parse time. Use them anywhere a value is expected.

---

## Shape Types

### `rect` — Rectangle

```lixscript
rect <id> at <x>, <y> size <width>x<height> {
  stroke: <color>          // border color (default: #fff)
  strokeWidth: <number>    // border thickness (default: 2)
  fill: <color>            // fill color (default: transparent)
  fillStyle: <style>       // none | solid | hachure | cross-hatch | dots
  roughness: <number>      // hand-drawn effect 0-3 (default: 1.5)
  style: <lineStyle>       // solid | dashed | dotted
  rotation: <degrees>      // rotation angle
  label: "<text>"          // embedded text label
  labelColor: <color>      // label color (default: #e0e0e0)
  labelFontSize: <number>  // label font size (default: 14)
}
```

### `circle` / `ellipse` — Circle or Ellipse

```lixscript
circle <id> at <x>, <y> size <width>x<height> {
  // Same properties as rect
  stroke: <color>
  fill: <color>
  label: "<text>"
  // ... all rect properties apply
}
```

The `size` defines the bounding box. Use equal width and height for a perfect circle.
Position (`at`) defines the top-left of the bounding box; the center is calculated automatically.

### `text` — Text Label

```lixscript
text <id> at <x>, <y> {
  content: "<text>"         // the text content (required)
  color: <color>            // text color (default: #fff)
  fontSize: <number>        // font size in px (default: 16)
  fontFamily: <family>      // font family (default: lixFont, sans-serif)
  anchor: <alignment>       // start | middle | end (default: middle)
}
```

### `arrow` — Directed Arrow

Arrows connect two points or two shapes.

```lixscript
arrow <id> from <source> to <target> {
  stroke: <color>           // line color (default: #fff)
  strokeWidth: <number>     // line thickness (default: 2)
  style: <lineStyle>        // solid | dashed | dotted
  head: <headStyle>         // default (more styles coming)
  headLength: <number>      // arrowhead size in px (default: 15)
  curve: <curveMode>        // straight | curved | elbow
  curveAmount: <number>     // curve intensity (default: 50)
  label: "<text>"           // label on the arrow
  labelColor: <color>       // label color (default: #e0e0e0)
  labelFontSize: <number>   // label font size (default: 12)
}
```

#### Connection Sources & Targets

Arrows can connect to **absolute coordinates** or **shape references**:

```lixscript
// Absolute coordinates
arrow a1 from 100, 200 to 300, 400 { ... }

// Shape references with side
arrow a2 from myRect.bottom to myCircle.top { ... }

// Shape reference (defaults to center)
arrow a3 from myRect to myCircle { ... }

// With offset
arrow a4 from myRect.right + 10 to myCircle.left { ... }
```

**Available sides:** `top`, `bottom`, `left`, `right`, `center`

When using shape references, arrows are **auto-attached** — they'll update position when the shape moves.

### `line` — Undirected Line

```lixscript
line <id> from <source> to <target> {
  stroke: <color>           // line color (default: #fff)
  strokeWidth: <number>     // line thickness (default: 2)
  style: <lineStyle>        // solid | dashed | dotted
  curve: <boolean>          // true | false (default: false)
  label: "<text>"           // label on the line
  labelColor: <color>       // label color
}
```

Lines use the same `from ... to ...` syntax as arrows. Supports both absolute coordinates and shape references.

### `frame` — Frame / Group Container

```lixscript
frame <id> at <x>, <y> size <width>x<height> {
  name: "<display name>"    // frame label (default: the id)
  stroke: <color>           // border color (default: #555)
  strokeWidth: <number>     // border thickness (default: 1)
  fill: <color>             // fill color (default: transparent)
  opacity: <number>         // 0-1 (default: 1)
  rotation: <degrees>       // rotation angle
  contains: <id1>, <id2>    // comma-separated shape IDs to include
}
```

If `contains` is omitted, **all shapes** are added to the frame. Specify shape IDs to include only selected shapes.

### `freehand` — Freehand Stroke

```lixscript
freehand <id> at 0, 0 {
  points: "x1,y1;x2,y2;x3,y3"  // semicolon-separated point list
  stroke: <color>                // stroke color (default: #fff)
  strokeWidth: <number>          // thickness (default: 3)
  thinning: <number>             // pressure sensitivity 0-1 (default: 0.5)
  roughness: <roughness>         // smooth | medium | rough
  style: <lineStyle>             // solid | dashed | dotted
}
```

Each point is `x,y` or `x,y,pressure` (pressure 0-1, default 0.5).

---

## Relative Positioning

Reference other shapes' positions for dynamic layout:

```lixscript
rect node1 at 200, 60 size 200x65 {
  label: "First"
}

// Place node2 to the right of node1 with 250px gap
rect node2 at node1.right + 250, node1.y size 200x65 {
  label: "Second"
}

// Place node3 below node1 with 150px gap
rect node3 at node1.x, node1.bottom + 150 size 200x65 {
  label: "Third"
}
```

**Available position references:**

| Reference      | Value                         |
|----------------|-------------------------------|
| `id.x`         | Left edge X                   |
| `id.y`         | Top edge Y                    |
| `id.right`     | Right edge (x + width)        |
| `id.bottom`    | Bottom edge (y + height)      |
| `id.left`      | Same as x                     |
| `id.top`       | Same as y                     |
| `id.centerX`   | Horizontal center             |
| `id.centerY`   | Vertical center               |
| `id.width`     | Shape width                   |
| `id.height`    | Shape height                  |

---

## Property Blocks

Properties can be defined in multi-line blocks or inline:

```lixscript
// Multi-line (recommended)
rect box at 100, 100 size 200x80 {
  stroke: #4A90D9
  fill: transparent
  label: "My Box"
}

// Inline (comma or semicolon separated)
rect box at 100, 100 size 200x80 { stroke: #4A90D9, label: "My Box" }

// No properties (uses defaults)
rect box at 100, 100 size 200x80
```

---

## Complete Example

```lixscript
// User authentication flow
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$gray = #e0e0e0

// Nodes
rect login at 200, 60 size 200x65 {
  stroke: $blue
  label: "Login Page"
}

rect validate at login.x, login.bottom + 150 size 260x70 {
  stroke: $blue
  label: "Validate Credentials"
}

circle check at validate.x, validate.bottom + 150 size 110x110 {
  stroke: $red
  label: "Valid?"
}

rect dashboard at check.x, check.bottom + 150 size 200x65 {
  stroke: $green
  label: "Dashboard"
}

rect error at check.right + 250, check.y size 200x65 {
  stroke: $red
  label: "Show Error"
}

// Connections
arrow a1 from login.bottom to validate.top {
  stroke: $gray
  label: "Submit"
}

arrow a2 from validate.bottom to check.top {
  stroke: $gray
}

arrow a3 from check.bottom to dashboard.top {
  stroke: $green
  label: "Yes"
}

arrow a4 from check.right to error.left {
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

// Frame is auto-created if omitted — or define one explicitly:
frame authFlow at 130, 10 size 780x750 {
  name: "Auth Flow"
}
```

---

## Programmatic API

LixScript is also available as a JavaScript API:

```javascript
// Parse source (returns AST with errors)
const parsed = window.__lixscriptParse(source)

// Generate SVG preview string
const svgMarkup = window.__lixscriptPreview(source)

// Execute on canvas (creates real shapes)
const result = window.__lixscriptExecute(source)
// result: { success, shapesCreated, errors }

// Render from pre-parsed AST
const result = window.__lixscriptRender(parsed)
```

---

## Color Reference

Use hex colors (`#RGB` or `#RRGGBB`) or CSS color names:

```lixscript
stroke: #4A90D9        // hex
fill: #fff             // short hex
stroke: transparent    // keyword
```

## Line Styles

| Value    | Result          |
|----------|-----------------|
| `solid`  | Continuous line |
| `dashed` | Long dashes     |
| `dotted` | Short dots      |

## Fill Styles (rect/circle)

| Value         | Result                    |
|---------------|---------------------------|
| `none`        | No fill (transparent)     |
| `solid`       | Solid color fill          |
| `hachure`     | Diagonal line hatching    |
| `cross-hatch` | Cross-hatched pattern     |
| `dots`        | Dotted pattern fill       |

## Curve Modes (arrow)

| Value      | Result                        |
|------------|-------------------------------|
| `straight` | Direct line                   |
| `curved`   | Bezier curve                  |
| `elbow`    | Right-angle routing           |
