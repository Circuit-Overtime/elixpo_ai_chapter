"""Strip the background from raw sprite PNGs.

Reads:   apps/<app>/assets/raw/*.png
Writes:  apps/<app>/assets/transparent/*.png   (RGBA, background = alpha 0)

Default strategy: flood-fill from the four corners and mark every connected
pixel that's within `--tolerance` of the corner colour as transparent. This
works perfectly for our generated sprites that come with a solid "plain warm
cream background" prompt.

Optional: pass `--rembg` to use the rembg AI model (better for complex
backgrounds, but pulls a ~100 MB model on first run).

Usage:
  python tools/transparent.py --app flappy
  python tools/transparent.py --app flappy panda_up_a panda_up_b
  python tools/transparent.py --app flappy --tolerance 60
  python tools/transparent.py --app flappy --rembg
  python tools/transparent.py --app flappy --feather 1     # 1-pixel edge soften
"""

import sys
from pathlib import Path
from PIL import Image
from collections import deque


def _parse(argv):
    args = list(argv)
    opts = {"app": None, "names": [], "tol": 40, "rembg": False, "feather": 0}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--app" and i + 1 < len(args):
            opts["app"] = args[i + 1]; i += 2
        elif a == "--tolerance" and i + 1 < len(args):
            opts["tol"] = int(args[i + 1]); i += 2
        elif a == "--feather" and i + 1 < len(args):
            opts["feather"] = int(args[i + 1]); i += 2
        elif a == "--rembg":
            opts["rembg"] = True; i += 1
        elif a.startswith("--"):
            print("Unknown flag:", a)
            sys.exit(2)
        else:
            opts["names"].append(a); i += 1
    if not opts["app"]:
        print("Usage: transparent.py --app <name> [stem ...] [--tolerance N] [--rembg]")
        sys.exit(2)
    return opts


def _flood_strip(img, tol):
    """Flood-fill from the 4 corners; mark connected bg pixels as alpha 0."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    visited = bytearray(w * h)              # 0=unseen, 1=bg
    starts  = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seeds   = [px[x, y][:3] for x, y in starts]
    # Use an "any seed close enough" predicate so dithered edges still match.
    def is_bg(c):
        for s in seeds:
            if (abs(c[0] - s[0]) <= tol and
                abs(c[1] - s[1]) <= tol and
                abs(c[2] - s[2]) <= tol):
                return True
        return False

    q = deque(starts)
    for sx, sy in starts:
        visited[sy * w + sx] = 1
    while q:
        x, y = q.popleft()
        c = px[x, y][:3]
        if not is_bg(c):
            visited[y * w + x] = 0    # not actually bg — release
            continue
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                visited[ny * w + nx] = 1
                q.append((nx, ny))

    # Build the alpha mask
    out = img.copy()
    op  = out.load()
    cleared = 0
    for y in range(h):
        for x in range(w):
            if visited[y * w + x]:
                r, g, b, _ = op[x, y]
                op[x, y] = (r, g, b, 0)
                cleared += 1
    return out, cleared


def _feather(img, radius):
    """Soften the alpha edge by `radius` pixels (avoids blocky cutouts)."""
    if radius <= 0:
        return img
    from PIL import ImageFilter
    a = img.split()[3].filter(ImageFilter.GaussianBlur(radius))
    rgba = list(img.split())
    rgba[3] = a
    return Image.merge("RGBA", rgba)


def _rembg_strip(img):
    from rembg import remove
    return remove(img.convert("RGBA"))


def main():
    opts = _parse(sys.argv[1:])
    raw  = Path("apps") / opts["app"] / "assets" / "raw"
    out  = Path("apps") / opts["app"] / "assets" / "transparent"
    if not raw.exists():
        print("No raw directory at %s" % raw)
        return
    out.mkdir(parents=True, exist_ok=True)

    sources = sorted(raw.glob("*.png"))
    if opts["names"]:
        sources = [s for s in sources if s.stem in opts["names"]]
    if not sources:
        print("Nothing to process in %s" % raw)
        return

    mode = "rembg" if opts["rembg"] else "flood-fill (tol=%d)" % opts["tol"]
    print("Stripping backgrounds with %s   →   %s\n" % (mode, out))

    for src in sources:
        img = Image.open(src).convert("RGBA")

        if opts["rembg"]:
            result = _rembg_strip(img)
            note = "rembg"
        else:
            result, cleared = _flood_strip(img, opts["tol"])
            pct = 100.0 * cleared / (img.size[0] * img.size[1])
            note = "%5.1f%% transparent" % pct

        if opts["feather"]:
            result = _feather(result, opts["feather"])

        dst = out / src.name
        result.save(dst, format="PNG", optimize=True)
        print("  %-25s  %dx%d  →  %s   [%s]" %
              (src.stem, img.size[0], img.size[1], dst.name, note))

    print("\nDone. Run:  python tools/optimize_assets.py --app %s" % opts["app"])


if __name__ == "__main__":
    main()
