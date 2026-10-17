"""Asset optimizer for Oreo Badge.

Top-level icons (32×32):
  assets/icons/raw/{name}.{png,jpg,jpeg}   →   assets/icons/optimized/{name}.py

Status icons (13×13 white-on-pink, rasterized from SVG):
  assets/status/raw/*.svg                  →   assets/status/optimized/*.py

Per-app sprites/backgrounds (arbitrary size via SIZES table or _bg suffix):
  apps/<app>/assets/raw/*.{png,jpg,jpeg}   →   apps/<app>/assets/optimized/*.py

Run from project root:
    python tools/optimize_assets.py                 # all top-level icons
    python tools/optimize_assets.py snake_icon      # single icon
    python tools/optimize_assets.py --status        # SVG status icons
    python tools/optimize_assets.py --splash-logo   # favicon → transparent 72×72 logo
    python tools/optimize_assets.py --app flappy    # all sprites in apps/flappy/assets/raw
"""

import sys
import struct
from pathlib import Path
from PIL import Image

# ── config ────────────────────────────────────────────────────────────────────

RAW_DIR      = Path("assets/icons/raw")
HW_DIR       = Path("assets/icons/optimized")

ICON_SIZE    = 32
BG_W         = 80
BG_H         = 60
BADGE_BG     = (255, 248, 235)   # warm cream — fills transparent pixels

STATUS_SVG_DIR = Path("assets/status/raw")
STATUS_HW_DIR  = Path("assets/status/optimized")
STATUS_SIZE    = 13
# Fill OUTSIDE the SVG's alpha with the chroma-key sentinel so display.blit()
# treats those pixels as transparent. The icons then read correctly on ANY
# header colour (crimson on the launcher, forest-green on the home screen, …).
STATUS_BG      = (248, 0, 248)   # magenta → RGB565 0xF81F → blit chroma-key

# Chroma-key magenta. Packs to RGB565 0xF81F (bytes [0xF8, 0x1F]). Any sprite
# pixel matching this value is treated as transparent by display.blit().
CHROMA_KEY = (248, 0, 248)

SPLASH_LOGO_SOURCE = Path("oreo.elixpo/public/favicon.ico")
SPLASH_LOGO_OUT    = Path("assets/sprites/optimized/favicon_logo.py")
SPLASH_LOGO_SIZE   = 72

# Per-app: fill for OPAQUE assets (transparent pixels get this colour, no key).
PER_APP_FILL = {
    "flappy":   (120, 200, 240),
}

# Per-app: stems that should be treated as OPAQUE (no chroma key, full coverage).
# Everything else uses CHROMA_KEY as the transparent fill.
# Note: grass is NOT opaque — its source PNG contains sky at the top, which
# gets stripped in transparent/grass.png. The chroma key lets the bg show
# through that sky region when the tile is overlaid on the bottom of the screen.
PER_APP_OPAQUE = {
    "flappy":   {"background"},
    "weather":  {"background"},
    "snake":    {"arena"},
    # Road tarmac fully covers its tile; cars + trees need chroma-key
    # transparency so they composite over the road and grass.
    "racer":    {"racer_road"},
}

# Per-app asset target sizes (W, H) by file stem.
# Names matching neither this table nor _bg fall back to 32×32.
PER_APP_SIZES = {
    # flappy game
    "panda_up_a":   (32, 32),
    "panda_up_b":   (32, 32),
    "panda_down":   (32, 32),
    "panda_crash":  (32, 32),
    "panda_blast":  (32, 32),
    "obstacle":     (32, 96),
    "background":   (80, 60),   # also used by weather/background but bigger output OK
    "cloud":        (40, 20),
    "grass":        (40, 40),

    # pet — panda expressions + heart icon (sized to fit the Pet UI)
    "panda_happy":  (64, 64),
    "panda_hungry": (64, 64),
    "panda_sad":    (64, 64),
    "panda_sleep":  (64, 64),
    "panda_eat":    (64, 64),
    "heart":        (16, 16),

    # weather — panda condition sprites
    "panda_sun":    (80, 80),
    "panda_cloud":  (80, 80),
    "panda_rain":   (80, 80),
    "panda_snow":   (80, 80),
    "panda_storm":  (80, 80),

    # snake — tiled arena bg + bamboo food sprite (CELL_PX size)
    "arena":        (40, 40),
    "food":         (10, 10),

    # splash — quarter-res backdrop (160×120). oreoOS/splash.py upscales it
    # to 320×240 at boot. Storing 4× smaller keeps the .py module under 200 KB
    # so the MicroPython parser doesn't OOM the boot heap.
    "splash_bg":    (160, 120),

    # color_picker — hue × lightness rainbow. Stored quarter-res; the app
    # upscales 4x to fill the play area. 80×49 = ~7 kB .py module.
    "color_splash": (80, 49),

    # racer game — top-down kart, oncoming cars, verge trees, tiled tarmac
    "racer_player":       (32, 40),
    "racer_player_crash": (32, 40),
    "racer_enemy_a":      (32, 40),
    "racer_enemy_b":      (32, 40),
    "racer_tree":         (24, 32),
    "racer_road":         (80, 80),
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _resize_clean(src: Image.Image, size: int) -> Image.Image:
    return src.convert("RGBA").resize((size, size), Image.LANCZOS)


def _fill_transparent(img: Image.Image, fill_rgb: tuple, alpha_threshold=128) -> Image.Image:
    """Composite onto a solid fill_rgb, but use a HARD binary alpha mask.

    Pixels with alpha >= alpha_threshold keep their subject RGB; pixels below
    become pure fill_rgb. This prevents partial-alpha edge pixels from blending
    the subject with the chroma-key colour (which manifests as a lavender halo
    when the fill is magenta).
    """
    img   = img.convert("RGBA")
    alpha = img.split()[3].point(lambda v: 255 if v >= alpha_threshold else 0)
    bg    = Image.new("RGBA", img.size, (fill_rgb[0], fill_rgb[1], fill_rgb[2], 255))
    bg.paste(img, mask=alpha)
    return bg.convert("RGB")


def _to_rgb565_bytes(img_rgb: Image.Image) -> bytes:
    w, h = img_rgb.size
    px   = img_rgb.load()
    words = []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            words.append(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
    return struct.pack(">%dH" % len(words), *words)


def _letterbox(img: Image.Image, size: tuple) -> Image.Image:
    """Fit the complete image inside size without cropping or distortion."""
    target_w, target_h = size
    src = img.convert("RGB")
    src.thumbnail((target_w, target_h), Image.LANCZOS)
    # Use the source corner as the matte colour so artwork with a near-white
    # background blends into the added top/bottom bands cleanly.
    matte = src.getpixel((0, 0))
    out = Image.new("RGB", (target_w, target_h), matte)
    out.paste(src, ((target_w - src.width) // 2,
                    (target_h - src.height) // 2))
    return out


def _write_py_module(path: Path, data: bytes, w: int, h: int):
    words = struct.unpack_from(">%dH" % (len(data) // 2), data)
    chunk = 16
    lines = [
        '"""Auto-generated bitmap — do not edit. Re-run tools/optimize_assets.py."""',
        "W = %d" % w,
        "H = %d" % h,
        "DATA = (",
    ]
    for i in range(0, len(words), chunk):
        row = words[i:i + chunk]
        lines.append("    b'" + "".join(
            "\\x%02x\\x%02x" % (v >> 8, v & 0xFF) for v in row
        ) + "'")
    lines.append(")")
    path.write_text("\n".join(lines) + "\n")


# ── icon processing ───────────────────────────────────────────────────────────

def optimize(src: Path):
    raw_kb = src.stat().st_size // 1024
    print("  %-32s  %3dkB raw  →" % (src.stem, raw_kb), end="")

    HW_DIR.mkdir(parents=True, exist_ok=True)
    img_raw = Image.open(src)
    is_bg   = src.stem.endswith("_bg")

    if is_bg:
        hw_img  = img_raw.convert("RGBA").resize((BG_W, BG_H), Image.LANCZOS)
        hw_rgb  = _fill_transparent(hw_img, BADGE_BG)
        hw_data = _to_rgb565_bytes(hw_rgb)
        hw_out  = HW_DIR / ("%s.py" % src.stem)
        _write_py_module(hw_out, hw_data, BG_W, BG_H)
    else:
        hw_img  = _resize_clean(img_raw, ICON_SIZE)
        hw_rgb  = _fill_transparent(hw_img, BADGE_BG)
        hw_data = _to_rgb565_bytes(hw_rgb)
        hw_out  = HW_DIR / ("%s.py" % src.stem)
        _write_py_module(hw_out, hw_data, ICON_SIZE, ICON_SIZE)

    print("  %dB  → %s" % (hw_out.stat().st_size, hw_out))


# ── SVG status icon processing ────────────────────────────────────────────────

def optimize_app(app_name, fill_override=None):
    """Optimize app sprites → optimized/*.py.

    Sources (per-file preference):
      apps/<app>/assets/transparent/<name>.png  (background removed — preferred)
      apps/<app>/assets/raw/<name>.png          (fallback)

    Cleared (alpha=0) pixels are filled with:
      • PER_APP_FILL[app] (e.g. sky blue) for stems in PER_APP_OPAQUE[app]
      • CHROMA_KEY magenta for everything else → blit() treats as transparent
    """
    # `--app <name>` resolves to either apps/<name>/ (default-installed)
    # or apps_market/<name>/ (optional, installed at runtime by the
    # Store app). Pick whichever has a raw/ folder so existing flows
    # don't break after a move.
    for root in (Path("apps"), Path("apps_market")):
        if (root / app_name / "assets" / "raw").exists() or \
           (root / app_name / "assets" / "transparent").exists():
            break
    raw_dir  = root / app_name / "assets" / "raw"
    tr_dir   = root / app_name / "assets" / "transparent"
    out_dir  = root / app_name / "assets" / "optimized"
    out_dir.mkdir(parents=True, exist_ok=True)

    opaque_fill = fill_override or PER_APP_FILL.get(app_name, BADGE_BG)
    opaque_set  = PER_APP_OPAQUE.get(app_name, set())

    # Accept .png / .jpg / .jpeg (case-insensitive). PIL decodes all three;
    # we treat them uniformly downstream since each is converted to RGBA.
    raws = []
    for p in sorted(raw_dir.iterdir() if raw_dir.exists() else []):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg") and p.is_file():
            raws.append(p)

    sources = []
    for r in raws:
        # Prefer the matching transparent PNG when one exists (the background
        # stripper always writes .png regardless of source format).
        tr = tr_dir / (r.stem + ".png")
        sources.append(tr if tr.exists() else r)

    if not sources:
        print("No raw images (.png / .jpg / .jpeg) in", raw_dir)
        return

    print("Optimizing %d asset(s) for app '%s'  [opaque-fill=rgb%s, chroma-key=rgb%s]...\n"
          % (len(sources), app_name, opaque_fill, CHROMA_KEY))
    # Gallery is the one app where we want to preserve the source aspect
    # ratio rather than squash into a fixed-size sprite. We fit each photo
    # into the play area (320×196) and let the renderer letterbox it.
    GALLERY_MAX_W, GALLERY_MAX_H = 320, 196

    for src in sources:
        img_raw = Image.open(src)

        if app_name == "gallery":
            sw, sh = img_raw.size
            scale  = min(GALLERY_MAX_W / sw, GALLERY_MAX_H / sh, 1.0)
            w      = max(1, int(round(sw * scale)))
            h      = max(1, int(round(sh * scale)))
            # Force even dimensions so the row stride packs cleanly.
            w -= w & 1
            h -= h & 1
            hw_img = img_raw.convert("RGBA").resize((w, h), Image.LANCZOS)
            # Photos are always opaque — no chroma-key.
            hw_rgb = hw_img.convert("RGB")
        else:
            size = PER_APP_SIZES.get(src.stem)
            if size is None:
                size = (BG_W, BG_H) if src.stem.endswith("_bg") else (ICON_SIZE, ICON_SIZE)
            w, h      = size
            is_opaque = src.stem in opaque_set
            fill      = opaque_fill if is_opaque else CHROMA_KEY
            hw_img    = img_raw.convert("RGBA").resize((w, h), Image.LANCZOS)
            hw_rgb    = _fill_transparent(hw_img, fill)

        hw_data = _to_rgb565_bytes(hw_rgb)
        out     = out_dir / ("%s.py" % src.stem)
        _write_py_module(out, hw_data, w, h)
        kind = "photo" if app_name == "gallery" else (
               "opaque" if src.stem in opaque_set else "key")
        print("  %-25s  →  %dx%d  %5dB  [%s]" %
              (src.stem, w, h, out.stat().st_size, kind))


def optimize_status_svgs():
    """Rasterize SVGs to white-on-pink status icons.

    Uses the SVG alpha channel as a mask only — all opaque pixels become white,
    regardless of the original SVG fill colour.
    """
    try:
        import cairosvg
        from io import BytesIO
    except ImportError:
        print("cairosvg not installed — run: pip install cairosvg")
        return

    STATUS_HW_DIR.mkdir(parents=True, exist_ok=True)
    svgs = sorted(STATUS_SVG_DIR.glob("*.svg"))
    if not svgs:
        print("No SVGs found in", STATUS_SVG_DIR)
        return

    print("Processing %d SVG(s) from %s...\n" % (len(svgs), STATUS_SVG_DIR))
    for svg in svgs:
        name = svg.stem.replace("_icon", "").replace("bluetooh", "bluetooth")
        hi   = STATUS_SIZE * 4
        png  = cairosvg.svg2png(url=str(svg), output_width=hi, output_height=hi)
        img  = Image.open(BytesIO(png)).convert("RGBA").resize(
            (STATUS_SIZE, STATUS_SIZE), Image.LANCZOS)

        # Build white icon on chroma-key magenta. THRESHOLD the alpha first —
        # without this the anti-aliased edges blend white/magenta into pink
        # halos that aren't pure chroma-key and don't blit as transparent.
        alpha = img.split()[3].point(lambda v: 255 if v >= 96 else 0)
        out_img = Image.new("RGB", (STATUS_SIZE, STATUS_SIZE),
                            (STATUS_BG[0], STATUS_BG[1], STATUS_BG[2]))
        white = Image.new("RGB", (STATUS_SIZE, STATUS_SIZE), (255, 255, 255))
        out_img.paste(white, mask=alpha)

        data = _to_rgb565_bytes(out_img)
        out  = STATUS_HW_DIR / ("%s.py" % name)
        _write_py_module(out, data, STATUS_SIZE, STATUS_SIZE)
        print("  %-30s → %s" % (svg.name, out))


# ── entry point ───────────────────────────────────────────────────────────────

def optimize_sprites(targets=None):
    """Optimize top-level sprites: assets/sprites/raw/* → assets/sprites/optimized/*.py.

    Uses PER_APP_SIZES for known stems (e.g. splash_bg → 320×240, mascot → 72×72).
    Sprites are treated as opaque — no chroma-key, no transparency stripping.
    """
    raw_dir = Path("assets/sprites/raw")
    out_dir = Path("assets/sprites/optimized")
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        s for s in raw_dir.iterdir()
        if s.is_file() and s.suffix.lower() in (".png", ".jpg", ".jpeg")
    )
    if targets:
        sources = [s for s in sources if s.stem in targets]
    if not sources:
        print("No matching sprites in", raw_dir)
        return

    print("Optimizing %d sprite(s)...\n" % len(sources))
    for src in sources:
        size = PER_APP_SIZES.get(src.stem)
        if size is None:
            print("  SKIP %s (no entry in PER_APP_SIZES — add one to set its size)"
                  % src.name)
            continue
        w, h    = size
        source  = Image.open(src)
        # The website OG banner is 16:9 while the badge is 4:3. Preserve the
        # complete banner and add a small matte instead of squeezing its text
        # and panda horizontally.
        if src.stem == "splash_bg":
            img = _letterbox(source, (w, h))
        else:
            img = source.convert("RGB").resize((w, h), Image.LANCZOS)
        data    = _to_rgb565_bytes(img)
        out     = out_dir / ("%s.py" % src.stem)
        _write_py_module(out, data, w, h)
        print("  %-25s  →  %dx%d  %5dB" % (src.stem, w, h, out.stat().st_size))


def optimize_splash_logo():
    """Bake the website favicon into a transparent badge splash sprite."""
    if not SPLASH_LOGO_SOURCE.exists():
        raise FileNotFoundError("Splash logo not found: %s" % SPLASH_LOGO_SOURCE)

    source = Image.open(SPLASH_LOGO_SOURCE).convert("RGBA")
    source.thumbnail((SPLASH_LOGO_SIZE, SPLASH_LOGO_SIZE), Image.LANCZOS)
    canvas = Image.new("RGBA", (SPLASH_LOGO_SIZE, SPLASH_LOGO_SIZE), (0, 0, 0, 0))
    canvas.paste(source, (
        (SPLASH_LOGO_SIZE - source.width) // 2,
        (SPLASH_LOGO_SIZE - source.height) // 2,
    ), source)

    rgb = _fill_transparent(canvas, CHROMA_KEY, alpha_threshold=32)
    SPLASH_LOGO_OUT.parent.mkdir(parents=True, exist_ok=True)
    _write_py_module(
        SPLASH_LOGO_OUT,
        _to_rgb565_bytes(rgb),
        SPLASH_LOGO_SIZE,
        SPLASH_LOGO_SIZE,
    )
    print("  %s → %dx%d transparent RGB565 → %s" % (
        SPLASH_LOGO_SOURCE,
        SPLASH_LOGO_SIZE,
        SPLASH_LOGO_SIZE,
        SPLASH_LOGO_OUT,
    ))


def main():
    if "--splash-logo" in sys.argv:
        optimize_splash_logo()
        return

    if "--status" in sys.argv:
        optimize_status_svgs()
        return

    if "--sprites" in sys.argv:
        targets = [a for a in sys.argv[1:]
                   if not a.startswith("--") and a != "--sprites"]
        optimize_sprites(targets or None)
        return

    if "--app" in sys.argv:
        idx = sys.argv.index("--app")
        if idx + 1 >= len(sys.argv):
            print("Usage: optimize_assets.py --app <app_name> [--fill R,G,B]")
            return
        app = sys.argv[idx + 1]
        # Optional --fill R,G,B override
        fill = None
        if "--fill" in sys.argv:
            fi = sys.argv.index("--fill")
            if fi + 1 < len(sys.argv):
                try:
                    fill = tuple(int(x) for x in sys.argv[fi + 1].split(","))
                    if len(fill) != 3:
                        raise ValueError
                except ValueError:
                    print("--fill expects R,G,B (e.g. 120,200,240)")
                    return
        optimize_app(app, fill_override=fill)
        return

    targets = [a for a in sys.argv[1:] if not a.startswith("--")]
    sources = sorted(
        s for s in RAW_DIR.iterdir()
        if s.is_file() and s.suffix.lower() in (".png", ".jpg", ".jpeg")
    )
    if targets:
        sources = [s for s in sources if s.stem in targets]
    if not sources:
        print("No images (.png / .jpg / .jpeg) found in", RAW_DIR)
        return

    print("Optimizing %d icon(s)...\n" % len(sources))
    for src in sources:
        optimize(src)
    print("\nDone.  Hardware .py  →", HW_DIR)


if __name__ == "__main__":
    main()
