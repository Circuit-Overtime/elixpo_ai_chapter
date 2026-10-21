"""Compose every generated sticker in stickers/ into one printable sheet.

Reads PNGs from `stickers/` (skipping anything starting with `.` or
named `sheet.png`), arranges them on a grid in filename order, and
writes the result to `stickers/sheet.png`. Useful for:

  - Previewing the full set after generation.
  - Sending one file to a print shop instead of a dozen.
  - Posting a single image to social.

Default sheet size is **A4 portrait at 300 DPI** (2480 × 3508 px),
chosen so a print shop can drop it straight into their workflow.
Override via CLI flags if you need US Letter, landscape, etc.

Usage:
    python tools/compile_sticker_sheet.py
    python tools/compile_sticker_sheet.py --cols 3
    python tools/compile_sticker_sheet.py --w 2550 --h 3300   # US Letter
    python tools/compile_sticker_sheet.py --gap 24

Requires: Pillow (already in oreoOS/requirements.txt for the optimiser).
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("error: Pillow not installed — pip install pillow", file=sys.stderr)
    sys.exit(1)


STICKER_DIR = Path("stickers")
OUT_PATH    = STICKER_DIR / "oreoOS_gummy_sheet.png"
SKIP_NAMES  = {"sheet.png"}


def parse_args():
    p = argparse.ArgumentParser(
        description="Composite stickers/*.png into a single printable sheet.",
    )
    # A4 @ 300 DPI default — the most common print-shop format.
    p.add_argument("--w",    type=int, default=2480,
                   help="output sheet width in px (default 2480 = A4 @ 300 DPI)")
    p.add_argument("--h",    type=int, default=3508,
                   help="output sheet height in px (default 3508 = A4 @ 300 DPI)")
    p.add_argument("--cols", type=int, default=4,
                   help="number of sticker columns (default 3)")
    p.add_argument("--gap",  type=int, default=30,
                   help="gap between stickers in px (default 40)")
    p.add_argument("--margin", type=int, default=20,
                   help="outer page margin in px (default 80)")
    p.add_argument("--bg",   default="#FFF8EB",
                   help="sheet background colour (default warm ivory)")
    return p.parse_args()


def collect_stickers():
    """Every .png in stickers/ except the output itself. Sorted by name
    so the numeric prefixes (01_, 02_, ...) drive the grid order."""
    if not STICKER_DIR.is_dir():
        print(f"error: {STICKER_DIR}/ not found (run from repo root)",
              file=sys.stderr)
        sys.exit(1)
    files = sorted(
        p for p in STICKER_DIR.glob("*.png")
        if p.name not in SKIP_NAMES and not p.name.startswith(".")
    )
    if not files:
        print(f"error: no PNGs found in {STICKER_DIR}/", file=sys.stderr)
        print("       generate them first via Pollinations using the prompts",
              file=sys.stderr)
        print("       in prompts/stickers/, then re-run this script.",
              file=sys.stderr)
        sys.exit(1)
    return files


def main():
    args = parse_args()
    files = collect_stickers()
    print(f"compiling {len(files)} stickers into {args.w}x{args.h} sheet")

    cols = max(1, args.cols)
    rows = (len(files) + cols - 1) // cols

    # Compute the cell size so the grid + gaps + margins fit the page.
    grid_w = args.w - 2 * args.margin - (cols - 1) * args.gap
    grid_h = args.h - 2 * args.margin - (rows - 1) * args.gap
    cell_w = grid_w // cols
    cell_h = grid_h // rows
    # Stickers are square — use the smaller dimension so nothing stretches.
    cell = max(1, min(cell_w, cell_h))

    sheet = Image.new("RGB", (args.w, args.h), args.bg)

    # Centre the grid in the page (in case the cell sizing left slack).
    actual_grid_w = cols * cell + (cols - 1) * args.gap
    actual_grid_h = rows * cell + (rows - 1) * args.gap
    origin_x = (args.w - actual_grid_w) // 2
    origin_y = (args.h - actual_grid_h) // 2

    for i, fp in enumerate(files):
        r, c = divmod(i, cols)
        x = origin_x + c * (cell + args.gap)
        y = origin_y + r * (cell + args.gap)
        try:
            im = Image.open(fp).convert("RGBA")
        except Exception as e:
            print(f"  ! skipped {fp.name}: {e}")
            continue
        im.thumbnail((cell, cell), Image.LANCZOS)
        # Centre the resized sticker inside its cell.
        ox = x + (cell - im.width)  // 2
        oy = y + (cell - im.height) // 2
        # Use the alpha channel as the paste mask so the warm-cream
        # sheet background shows through any transparent edges.
        sheet.paste(im, (ox, oy), im)
        print(f"  + {fp.name} -> cell ({r}, {c})")

    sheet.save(OUT_PATH, optimize=True)
    print(f"wrote {OUT_PATH} ({args.w}x{args.h}, {len(files)} stickers)")


if __name__ == "__main__":
    main()
