# Oreo — the Elixpo mascot

> **Single source of truth.** Every Elixpo-branded asset — sticker, icon,
> banner, splash, app art — must respect the rules on this page. If a
> generated image contradicts MASCOT.md, the image is wrong, not the
> page.

---

## Identity at a glance

| | |
|---|---|
| **Name** | Oreo |
| **Species** | Panda (cartoon, kawaii) |
| **Style** | 8-bit pixel art with thick dark outline |
| **Vibe** | Warm, festive, celebratory — *NOT* dark mode |
| **Personality** | Curious, friendly, hacker-spirited, cheerful |

---

## Canonical anatomy

| Part | Colour | RGB | Hex |
|---|---|---|---|
| Fur (white/cream body) | Warm cream white | `rgb(240, 238, 232)` | `#F0EEE8` |
| Patches (ears, eye spots, limbs) | Dark outline / patches | `rgb(38, 38, 48)` | `#262630` |
| Eyes | Solid black with white catchlights | `rgb(38, 38, 48)` | `#262630` |
| Cheeks | Blush pink | `rgb(255, 93, 104)` | `#FF5D68` |
| Chest badge ("E-badge") | Red-gold (mascot's signature mark) | `rgb(220, 60, 50)` | `#DC3C32` |
| Outline (everywhere) | Dark outline | `rgb(38, 38, 48)` | `#262630` |

> The chest "E-badge" is **mandatory** — it is what makes Oreo *Elixpo's*
> panda. A panda without the badge is just a panda; with the badge it is
> Oreo.

---

## Brand palette (use freely as background / accents)

| Token | RGB | Hex | When to use |
|---|---|---|---|
| `BG` | `rgb(255, 248, 235)` | `#FFF8EB` | Page / canvas background — warm ivory |
| `CARD` | `rgb(255, 240, 210)` | `#FFF0D2` | Card / surface tint |
| `PRIMARY` | `rgb(255, 93, 104)` | `#FF5D68` | Buttons, borders, mascot cheeks |
| `TEAL` | `rgb(0, 180, 165)` | `#00B4A5` | Cool accent — water, wifi, BT vibes |
| `GOLD` | `rgb(255, 190, 30)` | `#FFBE1E` | Celebration gold, "verified" star |
| `ORANGE` | `rgb(255, 140, 30)` | `#FF8C1E` | Warm orange — fire, coffee, ship-it |
| `PURPLE` | `rgb(180, 80, 220)` | `#B450DC` | Festive purple — party, debug |
| `GREEN` | `rgb(60, 200, 100)` | `#3CC864` | Celebration green — go, success |
| `TEXT_BRIGHT` | `rgb(38, 38, 48)` | `#262630` | Dark text on light backgrounds |
| `MUTED` | `rgb(160, 120, 100)` | `#A07864` | Warm muted brown-pink labels |
| `STATUS_BG` | `rgb(255, 93, 104)` | `#FF5D68` | Status bar background |

---

## Hard rules (do, don't)

### ✅ Do
- Use **warm, bright backgrounds** — ivory, cream, warm white.
- Use **thick dark outlines** on every shape — pixel art demands them.
- Give Oreo **pink cheeks** (`#FF5D68`) and the **red chest badge**.
- Keep the canvas **square** (`1:1`) for stickers and icons.
- Default sticker output size: **1024×1024**. Icon source: **200×200**
  (optimised to 32×32 for the device).
- Add an explicit white-or-cream background — it lets the transparency
  pass auto-strip the background cleanly.

### ❌ Don't
- **No dark / navy / black backgrounds.** This is a celebration brand.
- **No text, no letters, no watermarks** unless the prompt explicitly
  asks for them.
- **No anatomy drift** — Oreo is *always* a panda, not a bear / cat /
  fox / dog. Keep ears round, body chubby, posture kawaii.
- **No realism.** Always pixel-art cartoon. Never 3D-rendered, never
  photoreal, never anime-shaded.
- **No alternative palette.** If a colour isn't in the tables above,
  don't use it.
- **No lanyard / no badge-card** unless the asset is literally a
  conference-badge product shot.

---

## The Style Suffix

Every prompt to the image API must end with this suffix. It is what
binds the model to the Oreo look across runs and seeds:

```
pixel art cartoon style, thick dark outline, vibrant warm celebration
colours, cute kawaii style, white or cream background, square crop,
no text, no watermark
```

For **stickers** specifically, use the sticker suffix instead — it adds
the die-cut white border that the transparency pass keys off:

```
pixel art cartoon style, thick dark outline, vibrant warm celebration
colours, cute kawaii style, sticker design with thick white border
ready for die-cut, warm cream white background, square crop, no text,
no watermark
```

---

## The Mascot Clause

When a prompt features Oreo (vs. just an object icon), append this
short anatomy clause **before** the style suffix, so the model can't
drift:

```
featuring the Oreo panda mascot: warm cream-white fur rgb(240,238,232),
dark patches rgb(38,38,48), rosy pink cheeks rgb(255,93,104), and a
red E-badge rgb(220,60,50) on the chest
```

---

## Prompt template

```
<one-line vibe sentence describing the scene>,
<MASCOT CLAUSE if Oreo appears>,
<STYLE SUFFIX>
```

Example (sticker):

```
Oreo the panda waving hello with both paws raised in celebration,
featuring the Oreo panda mascot: warm cream-white fur rgb(240,238,232),
dark patches rgb(38,38,48), rosy pink cheeks rgb(255,93,104), and a
red E-badge rgb(220,60,50) on the chest,
pixel art cartoon style, thick dark outline, vibrant warm celebration
colours, cute kawaii style, sticker design with thick white border
ready for die-cut, warm cream white background, square crop, no text,
no watermark
```

---

## Output spec by asset class

| Class | Source size | Final size | Background | Border |
|---|---|---|---|---|
| Sticker | 1024×1024 | 1024×1024 transparent PNG | Warm cream (auto-stripped) | Thick white die-cut border |
| App icon | 200×200 | 32×32 PNG | Warm cream / white | No |
| Banner | 1024×512 | 1024×512 PNG | Warm cream | No |
| Splash | 240×320 | 240×320 PNG | Warm cream / `BG` | No |

---

## Versioning

This is **MASCOT.md v1.0**. Material changes (palette shifts, new
mandatory anatomy, new asset class) bump the major version and require
a `MASCOT-CHANGES.md` entry. Minor wording fixes are silent.

The mascot itself is registered to **Ayushman Bhattacharya** under the
Indian Copyright Act, 1957 (see the OreoOS copyright filing, Diary
`LD-26455/2026-CO`). The Oreo character, the chest E-badge, and this
palette are the *visual identity*; their copyright is the author's.
External contributors who generate assets via the issue workflow are
granted a non-exclusive licence to use, share and remix those assets
for Elixpo-aligned purposes under the repository's open licence.
