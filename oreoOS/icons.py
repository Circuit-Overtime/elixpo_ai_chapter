"""Icon loading for app launcher tiles.

Priority:
  1. assets/icons/raw/{icon_filename}   — PNG decoded via PIL
  2. assets/icons/optimized/{stem}.py   — pre-baked RGB565 module
  3. None                               — caller draws letter fallback

Generate .py modules with `python tools/optimize_assets.py [name]`.
"""

import struct

_cache: dict = {}

ICON_SIZE = 32


def _png_to_rgb565(path: str, size=ICON_SIZE) -> bytes | None:
    try:
        from PIL import Image
        from oreoOS import theme
        img = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
        bg = Image.new("RGBA", (size, size),
                       (theme.BG_R, theme.BG_G, theme.BG_B, 255))
        bg.paste(img, mask=img.split()[3])
        rgb = bg.convert("RGB")
        pixels = []
        for y in range(size):
            for x in range(size):
                r, g, b = rgb.getpixel((x, y))
                pixels.append(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
        return struct.pack(">%dH" % len(pixels), *pixels)
    except Exception:
        return None


def load(app_dir: str, icon_filename: str | None = None) -> tuple | None:
    """Return (data_bytes, W, H) or None."""
    key = icon_filename or app_dir
    if key in _cache:
        return _cache[key]

    result = None

    # 1. PIL from raw PNG
    if icon_filename:
        data = _png_to_rgb565("assets/icons/raw/%s" % icon_filename)
        if data:
            result = (data, ICON_SIZE, ICON_SIZE)

    if result is None:
        for name in ("%s_icon" % app_dir, app_dir):
            data = _png_to_rgb565("assets/icons/raw/%s.png" % name)
            if data:
                result = (data, ICON_SIZE, ICON_SIZE)
                break

    # 2. Pre-baked .py module
    if result is None:
        stem = (icon_filename or app_dir).rsplit(".", 1)[0].replace("-", "_")
        for mod_name in [stem, "%s_icon" % app_dir]:
            try:
                mod = __import__("assets.icons.optimized.%s" % mod_name,
                                 None, None, ["DATA", "W", "H"])
                result = (mod.DATA, mod.W, mod.H)
                break
            except (ImportError, AttributeError):
                continue

    _cache[key] = result
    return result
