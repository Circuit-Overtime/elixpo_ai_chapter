# store_icon — App Store launcher icon

**Asset name:** `store_icon`
**Output size:** 200×200 → optimized to 32×32
**Used in:** `apps/store/manifest.json` — the Store tile in the launcher
**Theme reference:** See [THEME.md](THEME.md)

## Prompt

pixel art 8-bit icon: a chunky storefront facade with a striped pink-and-cream awning across the top, two square shop windows below the awning showing tiny app-tile silhouettes inside, a small panda-paw-print logo on the door, vibrant celebration palette (hot pink awning, warm cream walls, teal door, gold accent stripe), thick dark pixel outlines, clean square composition, joyful festive feel, no text, white background, thick dark pixel border around the icon

## Theme notes

See [THEME.md](THEME.md) for the full palette.

- Awning: hot pink rgb(255, 93, 104) with cream rgb(255, 248, 235) stripes
- Walls / facade body: warm cream rgb(255, 248, 235)
- Accents: gold rgb(255, 190, 30) under the awning, teal rgb(0, 180, 165) door
- Style: chunky 8-bit pixels matching the rest of the launcher icons (apps_icon, settings_icon, gallery_icon)
- Composition reads correctly at 32×32 — the awning + facade outline must be the dominant shape; the panda paw + window silhouettes are secondary detail that may blur away after downscale, that's OK
