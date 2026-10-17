"""Convert PNG → RGB565 bitmap for the Oreo badge display.

Usage:
    python tools/convert_asset.py asset/mascot.png assets/mascot.py --size 64 64
    python tools/convert_asset.py assets/icons/badge.png assets/icons/badge.py --size 32 32

The output .py file exposes:
    W, H  — dimensions
    DATA  — bytes object, RGB565 big-endian (same byte order as ST7789 DMA)

On hardware:  display.blit(DATA, x, y, W, H)
In sim:       display.blit(DATA, x, y, W, H)   (same API)

Background colour to treat as transparent can be specified with --bg (r g b),
default 255 255 255 (white).  Transparent PNG pixels also map to --bg colour.
Tolerance --tol controls how close to bg colour counts as transparent.
"""

import argparse
import os
import struct
from pathlib import Path


def rgb_to_565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def convert(src: Path, dst: Path, size: tuple[int, int],
            bg=(255, 255, 255), tol=30, bg_565=None):
    from PIL import Image

    img = Image.open(src).convert("RGBA").resize(size, Image.LANCZOS)

    w, h = img.size
    bg_r, bg_g, bg_b = bg
    # replacement colour for transparent / bg pixels
    fill_565 = bg_565 if bg_565 is not None else rgb_to_565(8, 8, 20)  # badge bg colour

    pixels = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            # Treat low-alpha or near-white pixels as background
            if a < 64 or (abs(r - bg_r) < tol and abs(g - bg_g) < tol and abs(b - bg_b) < tol):
                pixels.append(fill_565)
            else:
                pixels.append(rgb_to_565(r, g, b))

    # Pack as big-endian uint16
    data = struct.pack(">%dH" % len(pixels), *pixels)

    dst.parent.mkdir(parents=True, exist_ok=True)
    # Write as Python module with embedded bytes
    name = dst.stem.replace("-", "_")
    lines = [
        '"""Auto-generated bitmap — do not edit. Re-run tools/convert_asset.py."""',
        "W = %d" % w,
        "H = %d" % h,
        "DATA = (",
    ]
    chunk = 16  # uint16 values per line
    for i in range(0, len(pixels), chunk):
        row = pixels[i:i + chunk]
        lines.append("    b'" + "".join("\\x%02x\\x%02x" % (v >> 8, v & 0xFF) for v in row) + "'")
    lines.append(")")
    dst.write_text("\n".join(lines) + "\n")
    print("Written %s  (%d×%d, %d bytes)" % (dst, w, h, len(data)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="Source PNG")
    ap.add_argument("dst", help="Output .py file")
    ap.add_argument("--size", nargs=2, type=int, default=[64, 64], metavar=("W", "H"))
    ap.add_argument("--bg",  nargs=3, type=int, default=[255, 255, 255], metavar=("R", "G", "B"))
    ap.add_argument("--tol", type=int, default=30, help="Background tolerance")
    args = ap.parse_args()
    convert(Path(args.src), Path(args.dst), tuple(args.size), tuple(args.bg), args.tol)


if __name__ == "__main__":
    main()
