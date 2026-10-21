# Sticker prompts

Gummy-style die-cut stickers featuring the Oreo mascot in pixel-art form.
Generated via [Pollinations.ai](https://pollinations.ai), then composited
into a sheet for printing.

## Convention

Each `<name>.md` in this folder defines one sticker:

- A one-line vibe
- The Pollinations prompt
- Output size: **1024×1024** (square, high-res so the print survives
  resizing)
- A target file name in [`stickers/`](../../stickers/)

Backgrounds stay **warm cream / ivory** so the die-cut step has a clean
edge to cut around. The panda mascot keeps the canonical look across
every sticker: white-cream fur, pink cheeks `rgb(255, 93, 104)`, red
E-badge on chest. See [`prompts/icons/THEME.md`](../icons/THEME.md) for
the full palette.

## Workflow

```bash
# Generate (1024×1024) + auto-strip the cream background to transparent:
python tools/generate_assets.py --stickers

# Then composite into a printable sheet:
python tools/compile_sticker_sheet.py
```

The generator calls `tools/sticker_transparency.py` after each download
so PNGs land transparent-ready out of the box. The transparency pass
uses corner flood-fill (with tolerance 45) so the panda's white-cream
fur stays opaque — only the *background* cream connected to the edges
gets stripped.

If a sticker comes back with leaked transparency inside the panda or
leftover cream around it, re-run the post-step with a tweaked
tolerance:

```bash
# Looser fill — kills more bg but may leak into the panda
python tools/sticker_transparency.py 03_soldering --tolerance 55

# Tighter fill — preserves the panda but may leave cream halos
python tools/sticker_transparency.py 03_soldering --tolerance 35

# Save copies to a separate folder instead of overwriting
python tools/sticker_transparency.py --out stickers/transparent/
```

`compile_sticker_sheet.py` reads `stickers/*.png` and composites them
onto a warm-ivory A4 sheet (3 × 4 grid by default), with the alpha
channel preserved so the sheet background shows through the
transparent regions of each sticker.

## Style suffix (appended to every prompt)

```
pixel art cartoon style, thick dark outline, vibrant warm celebration
colours, cute kawaii style, sticker design with thick white border
ready for die-cut, warm cream white background, square crop, no text,
no watermark
```
