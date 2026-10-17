"""One-shot: generate the HSV spectrum PNG used by the Color Picker.

Renders an 80x49 hue-by-lightness spectrum that the Color Picker app
upscales 4x to fill the play area (320x196). The bottom half goes
hue→black (value 1→0 at saturation=1) and the top half goes white→hue
(saturation 0→1 at value=1). Hue runs left→right over 0..360 deg.

Run once after a fresh checkout (or when you want to tweak the spectrum
shape), then bake it with:

    python tools/_gen_color_splash.py
    python tools/optimize_assets.py --app color_picker
"""

import sys
from pathlib import Path

from PIL import Image

OUT_PATH = Path("apps_market/color_picker/assets/raw/color_splash.png")
W, H     = 320, 196          # we render at full screen size so the optimizer
                             # can downsample cleanly to its target 80x49.


def _hue_to_rgb(h_deg):
    """Pure hue (sat=1, val=1) at the given angle in degrees → (r, g, b)."""
    h = (h_deg % 360) / 60.0
    c = 255
    x = int(round(255 * (1 - abs(h % 2 - 1))))
    if   h < 1: return (c, x, 0)
    elif h < 2: return (x, c, 0)
    elif h < 3: return (0, c, x)
    elif h < 4: return (0, x, c)
    elif h < 5: return (x, 0, c)
    else:       return (c, 0, x)


def main():
    img = Image.new("RGB", (W, H))
    px  = img.load()
    mid = H // 2
    # Precompute pure-hue RGB per column → ~3x faster than recomputing per pixel.
    pure = [_hue_to_rgb(360 * x / W) for x in range(W)]
    for y in range(H):
        if y < mid:
            # Top half: white → pure_hue.  t=0 at very top, t=1 at midline.
            t = y / max(1, mid)
            for x in range(W):
                pr, pg, pb = pure[x]
                r = int(255 * (1 - t) + pr * t)
                g = int(255 * (1 - t) + pg * t)
                b = int(255 * (1 - t) + pb * t)
                px[x, y] = (r, g, b)
        else:
            # Bottom half: pure_hue → black.  t=0 at midline, t=1 at bottom.
            t = (y - mid) / max(1, H - mid)
            for x in range(W):
                pr, pg, pb = pure[x]
                px[x, y] = (int(pr * (1 - t)),
                            int(pg * (1 - t)),
                            int(pb * (1 - t)))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_PATH)
    print("Wrote %s  (%dx%d, %.1f kB)" %
          (OUT_PATH, W, H, OUT_PATH.stat().st_size / 1024.0))
    print("Now run:  python tools/optimize_assets.py --app color_picker")


if __name__ == "__main__":
    main()
