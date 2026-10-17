# Oreo Badge — Colour Theme Reference

This is a **celebration badge** — warm, festive, vibrant. NOT dark mode.
All generated assets must use this palette.

---

## Mascot palette (source of truth)

| Role              | RGB                  | Notes                          |
|-------------------|----------------------|--------------------------------|
| White fur         | rgb(240, 238, 232)   | Panda fur — warm cream white   |
| Cheek pink        | rgb(255,  93, 104)   | Primary accent — blush pink    |
| Badge gold/red    | rgb(220,  60,  50)   | E-badge on chest               |
| Dark outline      | rgb( 38,  38,  48)   | Body patches, use for text     |

---

## UI palette

| Token          | RGB                  | Usage                          |
|----------------|----------------------|--------------------------------|
| `BG`           | rgb(255, 248, 235)   | Page background — warm ivory   |
| `CARD`         | rgb(255, 240, 210)   | Cards, surfaces                |
| `PRIMARY`      | rgb(255,  93, 104)   | Pink — buttons, borders, bars  |
| `TEAL`         | rgb(  0, 180, 165)   | Cool teal accent               |
| `GOLD`         | rgb(255, 190,  30)   | Celebration gold               |
| `ORANGE`       | rgb(255, 140,  30)   | Warm orange                    |
| `PURPLE`       | rgb(180,  80, 220)   | Festive purple                 |
| `GREEN`        | rgb( 60, 200, 100)   | Celebration green              |
| `TEXT_BRIGHT`  | rgb( 38,  38,  48)   | Dark text on light backgrounds |
| `MUTED`        | rgb(160, 120, 100)   | Warm muted brown-pink labels   |
| `STATUS_BG`    | rgb(255,  93, 104)   | Status bar background          |

---

## Asset generation rules

1. **Backgrounds are WARM and BRIGHT** — ivory, cream, warm white. No black, no dark navy.
2. **Accents are VIBRANT** — use the full palette above freely.
3. **All icons have a white or cream background** so the optimizer can composite them correctly.
4. **Pixel art style** — chunky 8-bit pixels, thick dark outlines, kawaii cute aesthetic.
5. **No text, no watermarks, no characters** (unless the prompt specifically includes the panda).
6. **The panda mascot** always has: white/cream fur, pink cheeks rgb(255,93,104), red E-badge.

---

## Prompt style suffix (add to all icon prompts)

```
pixel art cartoon style, thick dark outline, vibrant warm celebration colors,
cute kawaii style, white background, square crop, no text, no watermark
```
