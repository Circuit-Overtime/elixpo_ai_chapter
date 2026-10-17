# @elixpo/lixsketch — NPM Package

The LixSketch engine is available as a standalone npm package. Mount an infinite, hand-drawn canvas on any SVG element in your app — React, Vue, Svelte, or plain HTML.

## Install

```bash
npm install @elixpo/lixsketch
```

## Quick Start

```js
import { LixSketch } from '@elixpo/lixsketch'

const svg = document.querySelector('#my-svg')
const sketch = new LixSketch(svg)
```

That's it. You get a fully interactive canvas with all drawing tools, zoom, pan, undo/redo, and the hand-drawn RoughJS aesthetic out of the box.

## What's Included

- **Drawing tools** — rectangles, circles, arrows, lines, freehand brush, text, code blocks, images, icons, frames
- **Selection & transform** — multi-select, drag, resize, rotate
- **Zoom & pan** — 0.4x to 30x zoom, smooth panning
- **Undo / redo** — full action-based history stack
- **Arrow attachments** — arrows snap and stay connected to shapes
- **LixScript** — declarative DSL for generating diagrams programmatically
- **Keyboard shortcuts** — standard shortcuts for all tools and actions

## Framework Examples

### React

```jsx
import { useEffect, useRef } from 'react'
import { LixSketch } from '@elixpo/lixsketch'

export default function Whiteboard() {
  const svgRef = useRef(null)

  useEffect(() => {
    const sketch = new LixSketch(svgRef.current)
    return () => sketch.destroy()
  }, [])

  return <svg ref={svgRef} style={{ width: '100%', height: '100vh' }} />
}
```

### Vanilla HTML

```html
<svg id="canvas" style="width:100%;height:100vh;"></svg>
<script type="module">
  import { LixSketch } from '@elixpo/lixsketch'
  new LixSketch(document.getElementById('canvas'))
</script>
```

## API

### `new LixSketch(svgElement, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | `'dark' \| 'light'` | `'dark'` | Canvas theme |
| `toolbar` | `boolean` | `true` | Show/hide the toolbar |
| `readonly` | `boolean` | `false` | Disable editing |
| `roughness` | `number` | `1.5` | Default RoughJS roughness |

### Instance Methods

- `sketch.destroy()` — tear down the canvas and clean up listeners
- `sketch.exportSVG()` — returns the canvas as an SVG string
- `sketch.loadShapes(data)` — load shapes from a serialized object
- `sketch.getShapes()` — get the current shapes array
- `sketch.setTool(toolName)` — programmatically switch the active tool
- `sketch.runLixScript(code)` — execute a LixScript string on the canvas

## Links

- [NPM Registry](https://www.npmjs.com/package/@elixpo/lixsketch)
- [GitHub](https://github.com/elixpo/sketch.elixpo)
- [LixScript Docs](/docs)
