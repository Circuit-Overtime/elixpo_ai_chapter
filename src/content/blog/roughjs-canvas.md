# Why We Chose RoughJS for the Canvas

Every shape in LixSketch looks hand-drawn. That's not a bug — it's the core design decision. We use [RoughJS](https://roughjs.com) to render every rectangle, circle, line, and arrow with a natural, sketchy aesthetic.

## The Philosophy

Design tools like Figma and Excalidraw have shown that imperfect-looking diagrams are often **more useful** than polished ones. Why?

- They signal "this is a draft" — inviting feedback rather than signaling finality
- They reduce the pressure to make things pixel-perfect
- They're faster to create because you stop fiddling with alignment

LixSketch takes this further by making the hand-drawn look the **only** look. There's no "clean mode" toggle. This forces the tool toward its sweet spot: early-stage thinking, architecture discussions, and rapid prototyping.

## How RoughJS Works

RoughJS takes geometric primitives (rectangles, circles, lines) and renders them with configurable "roughness":

- **roughness: 0** — clean, almost geometric
- **roughness: 1.5** — default, subtle hand-drawn wobble
- **roughness: 3** — very sketchy, like a quick whiteboard drawing

Under the hood, RoughJS perturbs control points along the path and adds subtle variations to stroke width. The result is SVG paths that look hand-drawn but are still mathematically defined shapes.

```lixscript
// Roughness Comparison
$blue = #4A90D9
$green = #2ECC71
$orange = #E67E22

rect clean at 50, 50 size 160x60 {
  stroke: $blue
  roughness: 0
  label: "roughness: 0"
}

rect default at 50, 150 size 160x60 {
  stroke: $green
  roughness: 1.5
  label: "roughness: 1.5"
}

rect sketchy at 50, 250 size 160x60 {
  stroke: $orange
  roughness: 3
  label: "roughness: 3"
}

arrow a1 from clean.bottom to default.top {
  stroke: #e0e0e0
}

arrow a2 from default.bottom to sketchy.top {
  stroke: #e0e0e0
}
```

## SVG, Not Canvas

Despite the name "canvas", LixSketch renders to SVG, not HTML5 Canvas. This gives us:

- **DOM access** — each shape is a real DOM element that can be selected, moved, and styled
- **Infinite resolution** — SVG scales cleanly at any zoom level
- **Event handling** — native mouse/touch events per element
- **Accessibility** — screen readers can traverse the shape tree

The tradeoff is performance at very high shape counts (1000+), but for the typical diagram use case (10-200 shapes), SVG is the better choice.

## Perfect Freehand

For the brush/drawing tool, we use [Perfect Freehand](https://github.com/steveruizok/perfect-freehand) to generate pressure-sensitive strokes. It takes an array of points (with optional pressure values) and outputs a smooth, variable-width path — perfect for that natural pen feel.
