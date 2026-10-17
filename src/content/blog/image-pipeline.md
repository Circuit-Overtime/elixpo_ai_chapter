# The Image Pipeline: From Pixels to Canvas to Cloud

Images are the heaviest objects on any canvas. A single uncompressed screenshot can weigh 5MB — multiply that by ten images and you've blown past localStorage limits, clogged autosave, and made collaboration painful. Here's how LixSketch handles images across every entry point: file uploads, AI generation, clipboard pastes, and frame backgrounds.

## The Problem

Images can arrive from four different sources:

1. **File upload** — user picks a PNG/JPG from their device
2. **AI generation** — Pollinations API returns a base64 data URI
3. **Clipboard paste** — user pastes a screenshot or copied image (Ctrl+V)
4. **Frame background** — user sets an image as a frame's background fill

All four share the same fundamental problem: the raw image data is a massive base64 string that needs to live on an SVG canvas, persist across page reloads, and sync to the cloud — without killing performance.

## The Pipeline

Every image, regardless of source, flows through the same async pipeline:

```
Raw Data → Compress → Place on Canvas → Upload to Cloudinary → Replace href with URL
```

### Step 1: Adaptive Compression

Before anything touches the canvas, images pass through our `compressImage()` utility:

- **Max dimension**: 1920px — anything larger gets scaled down proportionally
- **Target size**: 300KB — achieved by iteratively reducing JPEG quality
- **Quality floor**: 0.4 — we never go below this to avoid visible artifacts
- **Transparency detection**: Images with alpha channels stay as PNG (no quality reduction)
- **Frame backgrounds** get even more aggressive compression: 1280px max, quality 0.5

The compression runs entirely in the browser using a temporary `<canvas>` element — no server round-trip needed.

### Step 2: Canvas Placement

The compressed image (still a base64 data URI at this point) is placed on the SVG canvas as an `<image>` element. The user sees it immediately — no waiting for upload.

```
<image href="data:image/jpeg;base64,/9j/4AAQ..." x="100" y="200" width="400" height="300" />
```

This gives instant visual feedback while the upload happens in the background.

### Step 3: Signed Upload to Cloudinary

The upload is a three-phase process:

1. **Sign** — browser requests a signed upload URL from our API (`/api/images/sign`). The server generates an HMAC-SHA256 signature using the Cloudinary API secret, scoped to the user's session folder (`lixsketch/{sessionId}/img_{timestamp}`).

2. **Upload** — browser POSTs the compressed blob directly to Cloudinary's upload endpoint with the signature. This is a direct browser-to-Cloudinary transfer — our server never sees the image data.

3. **Replace** — once Cloudinary returns the CDN URL, the `<image>` element's `href` is swapped from the base64 data URI to the Cloudinary URL:

```
<image href="https://res.cloudinary.com/elixpo/image/upload/v.../lixsketch/session/img.jpg" ... />
```

### Step 4: Autosave Benefits

This swap is the key to the entire system. When autosave serializes the canvas every 10 seconds:

- **Before upload**: `href` contains base64 (large, but functional)
- **After upload**: `href` contains a URL (tiny, just a string)

This means localStorage never accumulates megabytes of base64 data. A canvas with 20 images might serialize to just 50KB instead of 50MB.

## Source-Specific Handling

### File Upload
User clicks the image tool → picks a file → `FileReader` converts to data URI → pipeline kicks in. We also enforce a per-room 5MB total limit to prevent runaway storage.

### AI Generation
The Pollinations API returns a base64 image in the response. When the user clicks "Place on Canvas" in the generate modal, the image is placed and immediately routed through `uploadImageToCloudinary()`. The loading indicator (a pulsing yellow icon) shows on the image until the upload completes.

### Clipboard Paste
We listen for the browser's `paste` event globally. When the clipboard contains image data:

```js
document.addEventListener('paste', (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile()
      // → FileReader → data URI → place → upload
    }
  }
})
```

The pasted image appears at the center of the current viewport.

### Frame Backgrounds
Frames support background images with fit modes (cover, contain, stretch). These images get extra-aggressive compression since they're decorative backgrounds, not precision content. The compressed data URI is stored directly on the frame's `_frameImageURL` property and persists through serialization.

## Upload Cancellation

If a user deletes an image while it's still uploading, we need to abort the in-flight request. Each `ImageShape` has an `AbortController`:

```js
imageShape.uploadAbortController = new AbortController()
const signal = imageShape.uploadAbortController.signal

// Every fetch in the pipeline checks: if (signal.aborted) return
```

When the shape is deleted, the controller is aborted and the upload silently stops.

## Loading Indicators

During upload, each image shows a small animated indicator (a pulsing icon in the top-left corner). The indicator:
- Appears when upload starts (`uploadStatus = 'uploading'`)
- Follows the image if it's moved
- Disappears when upload succeeds or fails
- Uses `pointer-events: none` so it doesn't interfere with selection

## Room Size Tracking

We track total image bytes per room via `window.__roomImageBytesUsed`. Each uploaded image's compressed size is added to this counter. When a user tries to add an image that would exceed 5MB total, they get a clear error message showing current and attempted usage.

## The Serialization Cycle

Here's the full lifecycle of an image through save/load, visualized as a LixScript diagram:

```lixscript
// Image serialization lifecycle
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$amber = #F39C12
$teal = #1ABC9C
$gray = #e0e0e0

rect action at 200, 60 size 200x65 {
  stroke: $blue
  fill: $blue
  fillStyle: solid
  roughness: 0
  label: "User action"
  labelColor: #ffffff
  shadeColor: $blue
  shadeOpacity: 0.25
}

text sources at action.x + 10, action.bottom + 20 {
  content: "upload / AI generate / paste / LixScript"
  color: #888
  fontSize: 10
}

rect compress at action.x, action.bottom + 100 size 200x65 {
  stroke: $amber
  roughness: 0
  label: "Compress → place on canvas"
  labelColor: $amber
}

rect upload at compress.x, compress.bottom + 130 size 200x65 {
  stroke: $teal
  fill: $teal
  fillStyle: solid
  roughness: 0
  label: "Upload → CDN URL replaces base64"
  labelColor: #ffffff
  shadeColor: $teal
  shadeOpacity: 0.25
}

rect save at upload.x, upload.bottom + 130 size 200x65 {
  stroke: $green
  roughness: 0
  label: "Autosave to localStorage (tiny URL)"
  labelColor: $green
}

rect reload at save.x, save.bottom + 130 size 200x65 {
  stroke: $blue
  fill: $blue
  fillStyle: solid
  roughness: 0
  fontSize: 3
  label: "Page reload → CDN load (fast)"
  labelColor: #ffffff
  shadeColor: $blue
  shadeOpacity: 0.25
}

arrow a1 from action.bottom to compress.top {
  stroke: $gray
  label: "base64 data URI"
  labelColor: #888
}

arrow a2 from compress.bottom to upload.top {
  stroke: $gray
  label: "≤300KB blob"
  labelColor: #888
}

arrow a3 from upload.bottom to save.top {
  stroke: $gray
  label: "href = cloudinary URL"
  labelColor: #888
}

arrow a4 from save.bottom to reload.top {
  stroke: $gray
  label: "JSON + URL strings"
  labelColor: #888
}

arrow a5 from reload.right to action.right {
  stroke: $green
  curve: curved
  curveAmount: 100
  style: dashed
  label: "Cycle"
  labelColor: $green
}

```

The same cycle applies to LixScript-generated images — the parser creates an `ImageShape`, which triggers the upload pipeline. By the next autosave tick, the `href` is already a Cloudinary URL.

On reload, images load from Cloudinary's CDN — fast, cached, and globally distributed. The canvas restore is nearly instant because localStorage only stores URLs, not pixel data.

## Key Design Decisions

1. **Compress before upload, not after** — saves bandwidth and storage costs
2. **Direct browser-to-Cloudinary upload** — our server never handles image blobs, only signs URLs
3. **Immediate visual feedback** — image appears on canvas instantly, upload happens in background
4. **URL replacement is atomic** — one `setAttribute('href', url)` swap, no intermediate states
5. **Same pipeline for all sources** — file uploads, AI images, clipboard pastes, and frame backgrounds all go through identical compress → upload → replace flow
6. **Graceful degradation** — if upload fails, the base64 image still works (just takes more localStorage space)

This architecture lets LixSketch handle dozens of images per canvas without performance degradation, while keeping autosave reliable and cloud sync efficient.

## Images in LixScript

LixScript — our declarative DSL for programmatic diagrams — also plugs into the image pipeline. You can place images and set frame backgrounds directly from code:

### Standalone Images

```lixscript
image diagram at 100, 200 size 300x200 {
  src: "/Images/blog_image.png"
  fit: contain
}
```

The `image` shape type accepts a `src` URL (or base64 data URI), position, size, and a `fit` mode (`cover`, `contain`, or `fill`). When the LixScript engine creates the shape, it goes through the same `ImageShape` class — and if the `src` is a data URI, the upload pipeline kicks in automatically.

### Frame Backgrounds

Frames support background images via the `imageURL` property:

```lixscript
frame header at 50, 50 size 600x200 {
  name: "Hero Section"
  stroke: #4A90D9
  fillStyle: solid
  fillColor: #1a1a2e
  imageURL: "/Images/blog_image.png"
  imageFit: cover
}
```

The `imageFit` property maps to SVG's `preserveAspectRatio`: `cover` slices to fill, `contain` fits within bounds, `fill` stretches to exact dimensions. This is useful for research paper illustrations where frames represent architectural components with visual context — a CNN block with a sample feature map, or a data pipeline stage with an example output.

### The Full LixScript → Canvas → Cloud Cycle

When AI generates a LixScript diagram containing images or frame backgrounds, here's the full cycle visualized as a LixScript diagram:

```lixscript
// LixScript → Canvas → Cloud pipeline
$blue = #4A90D9
$purple = #9B59B6
$green = #2ECC71
$amber = #F39C12
$teal = #1ABC9C
$gray = #e0e0e0

rect ai at 200, 60 size 280x65 {
  stroke: $purple
  fill: $purple
  fillStyle: solid
  roughness: 0
  label: "AI generates LixScript"
  labelColor: #ffffff
  shadeColor: $purple
  shadeOpacity: 0.25
}

rect parser at ai.x, ai.bottom + 140 size 280x65 {
  stroke: $blue
  fill: $blue
  fillStyle: solid
  roughness: 0
  label: "Parser creates shapes"
  labelColor: #ffffff
  shadeColor: $blue
  shadeOpacity: 0.25
}

rect compress at parser.x, parser.bottom + 140 size 280x65 {
  stroke: $amber
  fill: $amber
  fillStyle: solid
  roughness: 0
  label: "Compress images (300KB)"
  labelColor: #ffffff
  shadeColor: $amber
  shadeOpacity: 0.25
}

rect place at compress.x, compress.bottom + 140 size 280x65 {
  stroke: $green
  fill: $green
  fillStyle: solid
  roughness: 0
  label: "Place on SVG canvas"
  labelColor: #ffffff
  shadeColor: $green
  shadeOpacity: 0.25
}

rect upload at place.right + 280, place.y size 280x65 {
  stroke: $teal
  fill: $teal
  fillStyle: solid
  roughness: 0
  label: "Upload to Cloudinary"
  labelColor: #ffffff
  shadeColor: $teal
  shadeOpacity: 0.25
}

rect replace at upload.x, upload.bottom + 140 size 280x65 {
  stroke: $teal
  roughness: 0
  label: "Replace base64 → CDN URL"
  labelColor: $teal
}

rect autosave at replace.x, replace.bottom + 140 size 280x65 {
  stroke: $blue
  roughness: 0
  label: "Autosave to localStorage"
  labelColor: $blue
}

rect reload at autosave.x, autosave.bottom + 140 size 280x65 {
  stroke: $green
  fill: $green
  fillStyle: solid
  roughness: 0
  label: "Page reload → CDN load"
  labelColor: #ffffff
  shadeColor: $green
  shadeOpacity: 0.25
}

// Vertical flow (left column)
arrow a1 from ai.bottom to parser.top {
  stroke: $gray
  label: "rect, circle, image, icon"
  labelColor: #888
}

arrow a2 from parser.bottom to compress.top {
  stroke: $gray
  label: "data:image/png;base64..."
  labelColor: #888
}

arrow a3 from compress.bottom to place.top {
  stroke: $gray
  label: "≤300KB blob"
  labelColor: #888
}

// Branch right to async upload
arrow a4 from place.right to upload.left {
  stroke: $amber
  curve: curved
  label: "async (background)"
  labelColor: $amber
}

// Vertical flow (right column)
arrow a5 from upload.bottom to replace.top {
  stroke: $gray
  label: "secure_url"
  labelColor: #888
}

arrow a6 from replace.bottom to autosave.top {
  stroke: $gray
  label: "tiny URL string"
  labelColor: #888
}

arrow a7 from autosave.bottom to reload.top {
  stroke: $gray
  label: "JSON → shapes + CDN images"
  labelColor: #888
}

// Loop back from reload to canvas
arrow a8 from reload.left to place.right {
  stroke: $green
  curve: curved
  style: dashed
  label: "restored"
  labelColor: $green
}

frame pipeline at 130, 10 size 830x1230 {
  name: "LixScript → Canvas → Cloud"
  stroke: #555
}
```

This means an AI-generated research paper illustration with embedded images and annotated frames persists across sessions just like hand-drawn content — same pipeline, same reliability.
