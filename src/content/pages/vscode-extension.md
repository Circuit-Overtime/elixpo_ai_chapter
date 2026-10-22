# LixSketch for VS Code

Draw diagrams right inside your editor. The LixSketch VS Code extension gives you a full infinite canvas as an editor tab — no browser, no context switching.

## Install

Open VS Code and search for **LixSketch** in the Extensions panel, or run:

```bash
code --install-extension elixpo.lixsketch
```

OR Visit

```
https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch
```

## Features

- **Canvas tab** — open a LixSketch canvas as a VS Code editor tab
- **LixScript support** — `.lix` file syntax highlighting and preview
- **Live preview** — write LixScript in the editor, see the diagram update in real time
- **Export** — export your canvas as SVG or PNG from the command palette
- **Dark & light theme** — follows your VS Code theme automatically
- **All drawing tools** — the same full toolset as the web app: shapes, arrows, freehand, text, code blocks, icons, frames

## Usage

### Open a Canvas

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **LixSketch: New Canvas**
3. A new editor tab opens with the full canvas

### LixScript Files

Create a `.lix` file in your project. The extension provides:

- Syntax highlighting for LixScript
- A side-by-side preview panel (click the preview icon in the editor toolbar)
- Auto-complete for shape types, properties, and colors

```lixscript
rect login at 0,0 size 200x100 {
  label: "Login Page"
  fill: #2a2a3d
  stroke: $blue
}

rect dashboard at 300,0 size 200x100 {
  label: "Dashboard"
  fill: #2a2a3d
  stroke: $green
}

arrow a1 from login.right to dashboard.left {
  label: "Auth OK"
  stroke: $blue
}
```

### Commands

| Command | Description |
|---------|-------------|
| `LixSketch: New Canvas` | Open a blank canvas tab |
| `LixSketch: Preview LixScript` | Open live preview for the current `.lix` file |
| `LixSketch: Export as SVG` | Export the active canvas to SVG |
| `LixSketch: Export as PNG` | Export the active canvas to PNG |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `lixsketch.theme` | `auto \| dark \| light` | `auto` | Canvas theme (auto follows VS Code) |
| `lixsketch.roughness` | `number` | `1.5` | Default shape roughness |
| `lixsketch.toolbar` | `boolean` | `true` | Show toolbar in canvas tabs |

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch)
- [GitHub](https://github.com/elixpo/sketch.elixpo)
- [LixScript Docs](/docs)
