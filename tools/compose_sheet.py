"""Compose individual sprite PNGs into a single sprite-sheet PNG.

Each input frame becomes one cell in a `cols × rows` grid. Frames are
resized (LANCZOS) to `cell_w × cell_h` and laid out left-to-right, top-to-bottom.
Use the literal string `--empty` (or `_`) in place of a filename to leave a
cell transparent.

Examples:

  # 7×2 mona-style sheet, 48×48 per frame
  python tools/compose_sheet.py \\
      --out apps/flappy/assets/raw/mona_sheet.png \\
      --grid 7x2 --cell 48x48 --bg transparent \\
      panda_up.png panda_up.png panda_mid.png panda_level.png \\
      panda_tilt.png panda_down.png panda_down.png \\
      panda_dead_0.png panda_dead_1.png panda_dead_2.png \\
      panda_dead_3.png panda_dead_4.png _ _

  # paths are resolved relative to apps/flappy/assets/raw/ if --app is given
  python tools/compose_sheet.py --app flappy --grid 4x1 --cell 32x32 \\
      --out apps/flappy/assets/raw/strip.png  a.png b.png c.png d.png

The composed sheet is suitable input for `tools/optimize_assets.py --app <app>`.
Make sure `apps/<app>/assets/raw/<sheet_name>.png` matches a size entry in
optimize_assets.PER_APP_SIZES so it isn't accidentally squashed to 32×32.
"""

import sys
from pathlib import Path
from PIL import Image


def _parse_pair(s, label):
    if "x" not in s:
        raise SystemExit("--%s expects WxH (e.g. 7x2), got %r" % (label, s))
    a, b = s.lower().split("x", 1)
    return int(a), int(b)


def _pop(args, flag, conv=str):
    if flag not in args:
        return None
    i = args.index(flag)
    if i + 1 >= len(args):
        raise SystemExit("%s expects a value" % flag)
    v = args[i + 1]
    del args[i: i + 2]
    return conv(v)


def main(argv):
    args = list(argv)

    out_path = _pop(args, "--out")
    if not out_path:
        raise SystemExit("--out PATH is required")

    grid = _pop(args, "--grid", lambda s: _parse_pair(s, "grid"))
    if not grid:
        raise SystemExit("--grid COLSxROWS is required")
    cols, rows = grid

    cell = _pop(args, "--cell", lambda s: _parse_pair(s, "cell"))
    if not cell:
        raise SystemExit("--cell WxH is required")
    cw, ch = cell

    bg     = _pop(args, "--bg") or "transparent"
    app    = _pop(args, "--app")     # if given, resolve frames under apps/<app>/assets/raw/
    margin = _pop(args, "--margin", int) or 0

    # Whatever remains is the list of frame filenames.
    frames = args
    if not frames:
        raise SystemExit("no frame filenames given")
    if len(frames) > cols * rows:
        raise SystemExit("too many frames (%d) for grid %dx%d" % (len(frames), cols, rows))

    base = Path("apps") / app / "assets" / "raw" if app else Path(".")

    # Resolve background colour
    if bg == "transparent":
        bg_rgba = (0, 0, 0, 0)
    else:
        # accept #RRGGBB
        h = bg.lstrip("#")
        if len(h) != 6:
            raise SystemExit("--bg must be 'transparent' or #RRGGBB, got %r" % bg)
        bg_rgba = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

    sheet_w = cols * cw + (cols + 1) * margin
    sheet_h = rows * ch + (rows + 1) * margin
    sheet   = Image.new("RGBA", (sheet_w, sheet_h), bg_rgba)

    print("Composing sheet %dx%d (cells %dx%d, %d/%d filled) → %s"
          % (sheet_w, sheet_h, cw, ch, len(frames), cols * rows, out_path))

    placed = skipped = 0
    for idx, name in enumerate(frames):
        col = idx % cols
        row = idx // cols
        x   = margin + col * (cw + margin)
        y   = margin + row * (ch + margin)

        if name in ("_", "--empty"):
            print("  [%d, %d]  (empty)" % (col, row))
            skipped += 1
            continue

        p = (base / name) if not Path(name).is_absolute() else Path(name)
        if not p.exists():
            # try as-is too
            p2 = Path(name)
            if p2.exists():
                p = p2
            else:
                print("  [%d, %d]  MISSING %s" % (col, row, p))
                skipped += 1
                continue

        img = Image.open(p).convert("RGBA").resize((cw, ch), Image.LANCZOS)
        sheet.paste(img, (x, y), img)
        print("  [%d, %d]  %s  (%dx%d)" % (col, row, p.name, cw, ch))
        placed += 1

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, format="PNG", optimize=True)
    print("\nWrote %s  (%d placed, %d empty)" % (out_path, placed, skipped))


if __name__ == "__main__":
    main(sys.argv[1:])
