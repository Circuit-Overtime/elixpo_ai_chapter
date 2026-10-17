# Site assets — `oreo.elixpo/`

Image-generation prompts for everything the marketing site needs.
Each block is self-contained: copy the prompt into your generator
of choice (Midjourney, SDXL, DALL-E, Flux), render, then drop the
optimised output into `oreo.elixpo/public/` and reference it from
the relevant component.

All assets must use the brand palette in `oreo.elixpo/theme.js`:

| token     | hex       | use                                  |
|-----------|-----------|--------------------------------------|
| bg        | `#0F0C1c` | page background                      |
| primary   | `#FF5D68` | wordmark, CTAs, "active" glow        |
| teal      | `#3DDC97` | secondary accent                     |
| gold      | `#FFD166` | "metered" / warning accent           |
| lilac     | `#A29BFE` | tertiary accent                      |
| text      | `#F5E6DC` | foreground text                      |

When optimising for shipping: WebP at q=80 for photos, AVIF for hero,
SVG for logo/icons where possible.

---

## 1. `og-banner.png` — Open Graph / README banner (1200×630)

Used for: README header, OG image (Twitter/X, LinkedIn, Discord
preview), `metadata.openGraph.image`.

```
A minimalist dark hero image, 1200×630, deep purple-navy background
(#0F0C1C) with a soft radial pink-coral glow (#FF5D68) in the
upper-left. Centred slightly left: a small wireframe illustration of
a portrait pocket-sized conference badge with eight tactile buttons
in two rows below a rectangular screen. The screen shows a tiny app
drawer grid in matching pink. On the right side, large display
typography reads "OreoOS" in pink-coral, with "Python OS in a pocket
badge." below in cream (#F5E6DC). A faint scanline texture overlay
at 5% opacity. No people, no logos other than the wordmark, no
gradients besides the corner glow. Flat geometric style, like an
indie hardware project poster, not photorealistic.
```

Output: `oreo.elixpo/public/og-banner.png` and a copy at
`docs/og-banner.png` for the main repo README.

---

## 2. `logo-mark.svg` — square logomark (square, scalable)

Used for: header logo (currently a placeholder `o` glyph), favicon,
app icons on the badge.

```
A square pixel-art logomark, 64×64 logical pixels, sharp aliased
edges (no anti-aliasing). Dark purple-navy background (#0F0C1C).
A stylised lowercase 'o' rendered with two cookie-shaped halves —
the outer ring in pink-coral (#FF5D68), the inner highlight in
cream (#F5E6DC). The 'o' should read as both a letter AND an Oreo
cookie. No text, no shadow, no glow. Strictly the mark.
```

Output: `oreo.elixpo/public/logo-mark.svg` + a `favicon.ico` rendered
at 32px from the same source.

---

## 3. `hero-badge.png` — animated hero illustration (800×1000)

Used for: future home-page hero replacement of the CSS-only floating
tile preview.

```
An isometric line-art illustration of the Oreo badge on a clean
desk surface, 800×1000 portrait, viewed from a 35-degree angle. The
badge is a portrait-orientation PCB with a 240×320 screen showing a
3-column app grid in pink-coral tiles on dark background. Around
the screen: eight square tactile buttons in two rows of four,
labelled subtly with HOME / A / B / C / UP / DOWN / LEFT / RIGHT.
A USB-C cable trails out the bottom. Minor LED accents at the four
corners glowing pink. The background is solid dark purple-navy
(#0F0C1C) with a single soft pink radial glow under the badge for
ambient floor light. Style: clean blueprint-poster, flat colours
with thin 2px line art, no gradients on surfaces, no photorealism.
```

Output: `oreo.elixpo/public/hero-badge.webp`.

---

## 4. `screen-drawer.png`, `screen-transfer.png`, `screen-store.png` (480×640 each)

Used for: future "see it in action" carousel.

Each prompt is the same skeleton; vary only the screen content.

```
A pixel-perfect mockup of a single badge screen, 480×640 (showing
the device's 240×320 LCD at 2x). Portrait orientation. Dark
purple-navy chrome around a content area that shows {{SCREEN}}.
Crisp pixel grid, no anti-aliasing, fonts in Pixelify Sans 12px /
24px. Background outside the screen is solid #1F1B33 with a 1px
border at #2A2640.
```

Variants:
- `screen-drawer` — fill `{{SCREEN}}` with: *"a 3-column grid of 12
  app tiles, each tile is a single coloured square with a centred
  glyph; the third tile (Gallery) has a pink ring around it"*.
- `screen-transfer` — fill with: *"the SEND FILES page showing
  'oreo.elixpo.com/upload' in pink, a 6-character code 'K9MX72' in
  large pink text, a 60% green progress bar, and a small yellow dot
  to the right of the code"*.
- `screen-store` — fill with: *"the on-device App Store with 4
  rows: 'Color Picker', 'Oreo Pet', 'Flappy Oreo', 'Snake' — each
  row a coloured icon + name + chevron"*.

Outputs: `oreo.elixpo/public/screens/<name>.webp` (resize on export).

---

## 5. `panda-mascot.png` — Oreo Pet mascot full-size (512×512)

Used for: 404 page, marketing collateral, future "about the project"
photo.

```
A friendly pixel-art panda mascot, 512×512, centred in frame.
Round white body, classic black ear-and-eye-patches, sitting upright
with a small cookie held between its front paws. The cookie has
visible cream filling — explicitly an Oreo. Background is solid
dark purple-navy (#0F0C1C). Style: 32×32 pixel-art upscaled to
512px with nearest-neighbour scaling, sharp aliased edges, limited
palette: black, white, cream (#F5E6DC), and a tiny pink-coral
accent (#FF5D68) on the cookie filling and the panda's blush.
```

Output: `oreo.elixpo/public/panda.png`.

---

## Optimisation pipeline

```bash
# WebP for photos (80% quality is the sweet spot for our flat art)
cwebp -q 80 og-banner.png -o og-banner.webp

# AVIF for the hero
avifenc --min 20 --max 28 hero-badge.png hero-badge.avif

# SVG → optimised SVG
svgo logo-mark.svg
```

Drop the optimised outputs into `oreo.elixpo/public/`. The Next.js
static export will pick them up verbatim — no server-side image
optimisation involved.
