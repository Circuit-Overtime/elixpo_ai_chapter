"""Strip the cream background from generated stickers.

Pollinations produces stickers on a warm-cream/ivory background (per
prompt). For printing or compositing onto other media we want the
background transparent — but we can't just colour-key the cream,
because the panda mascot's fur is also white-cream. The reliable
trick: flood-fill from the four corners with a tolerance for
cream-ish pixels, and mark only the filled regions transparent. The
panda's interior is unreachable from any corner because the thick
dark outline blocks the fill, so it stays opaque.

Usage:
    python tools/sticker_transparency.py                    # all stickers/*.png
    python tools/sticker_transparency.py 01_hello           # single sticker
    python tools/sticker_transparency.py --tolerance 50     # looser fill
    python tools/sticker_transparency.py --out stickers/transparent/   # write copies

Defaults overwrite the source PNG in place — pass `--out <dir>` to
write to a separate folder instead, so you can keep the warm-cream
originals around.
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("error: Pillow not installed — pip install pillow", file=sys.stderr)
    sys.exit(1)

# numpy is optional — the floodfill itself uses pure Pillow, but the
# sentinel-to-alpha-mask step is ~100x faster with numpy on a 1024²
# image. We fall back to a pure-Python loop if numpy isn't around.
try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False


STICKER_DIR = Path("stickers")

# Sentinel colour the floodfill marks "background" pixels with. Magenta
# is the OS chroma key and shouldn't appear in any panda sticker.
SENTINEL = (255, 0, 255)


def parse_args():
    p = argparse.ArgumentParser(
        description="Make sticker backgrounds transparent via corner flood-fill.",
    )
    p.add_argument("names", nargs="*",
                   help="sticker stems to process (omit = all PNGs in stickers/)")
    p.add_argument("--tolerance", type=int, default=45,
                   help="floodfill colour tolerance (default 45). Higher = "
                        "more aggressive bg removal but more risk of eating "
                        "the panda's edge.")
    p.add_argument("--out", default=None,
                   help="output directory (default: overwrite in place)")
    p.add_argument("--in-dir", default=str(STICKER_DIR),
                   help="input directory (default: stickers/)")
    return p.parse_args()


def collect(in_dir, names):
    files = sorted(p for p in in_dir.glob("*.png")
                   if p.name != "sheet.png" and not p.name.startswith("."))
    if names:
        wanted = set(names)
        # Accept either bare stems (01_hello) or filenames (01_hello.png).
        files = [f for f in files
                 if f.stem in wanted or f.name in wanted]
        missing = wanted - {f.stem for f in files} - {f.name for f in files}
        for m in missing:
            print(f"  ! not found: {m}")
    return files


def make_transparent(in_path, out_path, tolerance):
    """Open PNG → flood-fill bg from 4 corners → write RGBA result."""
    im = Image.open(in_path).convert("RGBA")
    w, h = im.size

    # Floodfill operates on RGB; convert, mark, then translate back to alpha.
    rgb = im.convert("RGB")
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        # Skip if the corner already matches the sentinel (already-filled,
        # or someone re-ran the tool). Cheap check; saves a useless pass.
        if rgb.getpixel(corner) == SENTINEL:
            continue
        ImageDraw.floodfill(rgb, corner, SENTINEL, thresh=tolerance)

    if _HAS_NUMPY:
        # Vectorised path — ~100x faster on a 1024² sticker.
        arr = np.array(rgb)
        bg_mask = (
            (arr[:, :, 0] == SENTINEL[0]) &
            (arr[:, :, 1] == SENTINEL[1]) &
            (arr[:, :, 2] == SENTINEL[2])
        )
        rgba = np.array(im)
        rgba[bg_mask, 3] = 0
        Image.fromarray(rgba).save(out_path)
    else:
        # Pure-Pillow fallback. Slower (~5–15 s for 1024²) but always works.
        px_rgb = rgb.load()
        alpha = im.split()[3].load() if im.mode == "RGBA" else None
        im_out = im.copy()
        px_out = im_out.load()
        for y in range(h):
            for x in range(w):
                if px_rgb[x, y] == SENTINEL:
                    r, g, b, _ = px_out[x, y]
                    px_out[x, y] = (r, g, b, 0)
        im_out.save(out_path)


def main():
    args = parse_args()
    in_dir = Path(args.in_dir)
    if not in_dir.is_dir():
        print(f"error: {in_dir}/ not found (run from repo root)", file=sys.stderr)
        sys.exit(1)

    files = collect(in_dir, args.names)
    if not files:
        print(f"no PNGs to process in {in_dir}/", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out) if args.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    print(f"transparency pass on {len(files)} sticker(s)  "
          f"[tolerance={args.tolerance}, numpy={'on' if _HAS_NUMPY else 'off'}]")
    for fp in files:
        out = (out_dir / fp.name) if out_dir else fp
        try:
            make_transparent(fp, out, args.tolerance)
            print(f"  + {fp.name}{' → ' + str(out) if out_dir else ''}")
        except Exception as e:
            print(f"  ! {fp.name}: {e}")


if __name__ == "__main__":
    main()
