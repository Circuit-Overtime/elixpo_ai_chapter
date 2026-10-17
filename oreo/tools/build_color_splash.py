"""Generate the Color-Picker RGB splash background.

Renders an 80x49 PNG where:
  x axis -> hue 0..360
  y axis -> lightness 100 (top) .. 0 (bottom), saturation pinned at 100%

The Color Picker app loads this and upscales it 4x to 320x196 once at
entry. Pre-baking the small PNG keeps boot cheap; doing the HSL math at
device-runtime would take multiple seconds for the full screen.

Run once after adjusting the resolution. The optimizer then turns it into
assets/sprites/optimized/color_splash.py.
"""

from pathlib import Path
from PIL import Image

W, H = 80, 49
OUT  = Path("assets/sprites/raw/color_splash.png")


def hsl_to_rgb(h, s, l):
    s, l = s / 100.0, l / 100.0
    c = (1 - abs(2 * l - 1)) * s
    hh = (h % 360) / 60.0
    x = c * (1 - abs(hh % 2 - 1))
    m = l - c / 2
    if   hh < 1: r, g, b = c, x, 0
    elif hh < 2: r, g, b = x, c, 0
    elif hh < 3: r, g, b = 0, c, x
    elif hh < 4: r, g, b = 0, x, c
    elif hh < 5: r, g, b = x, 0, c
    else:        r, g, b = c, 0, x
    return (max(0, min(255, int(round((r + m) * 255)))),
            max(0, min(255, int(round((g + m) * 255)))),
            max(0, min(255, int(round((b + m) * 255)))))


def main():
    img = Image.new("RGB", (W, H))
    px  = img.load()
    for y in range(H):
        L = 100 - (y * 100) // max(1, H - 1)
        for x in range(W):
            hue = (x * 360) // W
            px[x, y] = hsl_to_rgb(hue, 100, L)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print("wrote", OUT, "(%dx%d)" % (W, H))


if __name__ == "__main__":
    main()
