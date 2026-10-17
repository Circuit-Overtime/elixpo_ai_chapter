"""Rasterise a TrueType font into a MicroPython-loadable bitmap module.

Output format (row-major, MSB-first, packed into bytes per row):

    GLYPH_W = 12
    GLYPH_H = 16
    BPR     = (GLYPH_W + 7) // 8     # bytes per row
    KERN    = 1                       # extra pixel between glyphs
    _FONT   = {
        ' ': b'\\x00\\x00...',          # BPR*GLYPH_H bytes per glyph
        '!': b'...',
        ...
    }

Render-side glyph cost: GLYPH_H × GLYPH_W loop, only set-bit pixels call
d.rect — typical pixel font is ~30% filled so a 12×16 glyph emits ~50 rects.

Usage:
    python tools/rasterise_font.py \\
        --ttf assets/fonts/raw/PixelifySans-Regular.ttf \\
        --out assets/fonts/optimized/pixelify_12.py \\
        --size 12

The pixel-size is the rendering box height in pixels; widths are auto-
fit per-glyph but capped at `--max-width` (default 16).
"""

import sys
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ASCII_START = 0x20      # space
ASCII_END   = 0x7E      # tilde


def _argparse():
    p = argparse.ArgumentParser()
    p.add_argument("--ttf",       required=True, help="path to TrueType font")
    p.add_argument("--out",       required=True, help="output .py module")
    p.add_argument("--size",      type=int, required=True,
                   help="rendering pixel height (glyph_h)")
    p.add_argument("--max-width", type=int, default=None,
                   help="cap glyph width (default = size * 0.85)")
    p.add_argument("--kern",      type=int, default=1,
                   help="inter-glyph spacing in pixels (default 1)")
    p.add_argument("--threshold", type=int, default=80,
                   help="alpha threshold for considering a pixel 'set'")
    return p.parse_args()


def _render_glyph(font, ch, target_w, target_h, threshold):
    """Render one character into a target_w × target_h binary bitmap."""
    img  = Image.new("L", (target_w, target_h), 0)
    draw = ImageDraw.Draw(img)
    # Centre the glyph in the cell using metrics
    try:
        bbox = font.getbbox(ch)
        ax   = -bbox[0]
        ay   = -bbox[1]
    except AttributeError:
        ax, ay = 0, 0
    draw.text((ax, ay), ch, fill=255, font=font)
    return img.point(lambda v: 255 if v >= threshold else 0)


def _pack_glyph(bitmap):
    """Bytes packing: row-major, MSB-first within each byte."""
    w, h = bitmap.size
    px   = bitmap.load()
    bpr  = (w + 7) // 8
    out  = bytearray(bpr * h)
    for y in range(h):
        for x in range(w):
            if px[x, y]:
                out[y * bpr + (x >> 3)] |= 0x80 >> (x & 7)
    return bytes(out)


def _format_bytes(data):
    """Compact `\\xab\\xcd` representation."""
    return "".join("\\x%02x" % b for b in data)


def main():
    args      = _argparse()
    ttf_path  = Path(args.ttf)
    out_path  = Path(args.out)
    size      = args.size
    max_w     = args.max_width or max(6, int(size * 0.85))

    font = ImageFont.truetype(str(ttf_path), size=size)
    glyph_h = size
    glyph_w = max_w
    bpr     = (glyph_w + 7) // 8

    print("Rasterising %s @ %d px → %dx%d cells (bpr=%d)"
          % (ttf_path.name, size, glyph_w, glyph_h, bpr))

    chars      = [chr(c) for c in range(ASCII_START, ASCII_END + 1)]
    packed     = {}
    for ch in chars:
        bitmap     = _render_glyph(font, ch, glyph_w, glyph_h, args.threshold)
        packed[ch] = _pack_glyph(bitmap)

    lines = [
        '"""Auto-generated bitmap font — do not edit. Re-run tools/rasterise_font.py."""',
        '',
        'GLYPH_W = %d' % glyph_w,
        'GLYPH_H = %d' % glyph_h,
        'BPR     = %d' % bpr,
        'KERN    = %d' % args.kern,
        '',
        '_FONT = {',
    ]
    for ch in chars:
        if ch == '\\':
            esc = "'\\\\'"
        elif ch == "'":
            esc = '"\'"'
        else:
            esc = "'%s'" % ch
        lines.append("    %s: b'%s'," % (esc, _format_bytes(packed[ch])))
    lines.append("}")
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines))
    size_kb = out_path.stat().st_size // 1024
    print("Wrote %s  (%d KB, %d glyphs)" % (out_path, size_kb, len(chars)))


if __name__ == "__main__":
    main()
