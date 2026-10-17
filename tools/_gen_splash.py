"""One-shot: generate the boot splash backdrop and bake it for the device.

Reads prompts/icons/splash_bg.md, downloads at 640×480 via Pollinations,
saves the raw PNG to assets/sprites/raw/splash_bg.png, then resizes to
320×240 and packs it as a big-endian RGB565 .py module at
assets/sprites/optimized/splash_bg.py — the path oreoOS/splash.py looks at.

Usage:
    python tools/_gen_splash.py            # default seed 42
    python tools/_gen_splash.py --seed 7
"""

import struct
import sys
from pathlib import Path

# Re-use the project's generator helpers (handles auth + retries).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.generate_assets import _read_prompt, download_to

from PIL import Image


RAW_PATH = Path("assets/sprites/raw/splash_bg.png")
OPT_PATH = Path("assets/sprites/optimized/splash_bg.py")
W, H     = 320, 240


def _seed():
    if "--seed" in sys.argv:
        i = sys.argv.index("--seed")
        try:
            return int(sys.argv[i + 1])
        except (IndexError, ValueError):
            pass
    return 42


def _pack_rgb565(img):
    px = img.load()
    out = bytearray(W * H * 2)
    i = 0
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y][:3]
            v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
            out[i]     = v >> 8
            out[i + 1] = v & 0xFF
            i += 2
    return bytes(out)


def _write_module(data):
    OPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    chunk = 24
    lines = [
        '"""Auto-generated splash background — do not edit. Re-run tools/_gen_splash.py."""',
        "",
        "W = %d" % W,
        "H = %d" % H,
        "",
        "DATA = (",
    ]
    for off in range(0, len(data), chunk):
        seg = data[off:off + chunk]
        lines.append("    b'" + "".join("\\x%02x" % b for b in seg) + "'")
    lines.append(")\n")
    OPT_PATH.write_text("\n".join(lines))


def main():
    prompt = _read_prompt("prompts/icons/splash_bg.md")
    if not prompt:
        print("No 'Prompt' section in prompts/icons/splash_bg.md")
        sys.exit(1)
    seed = _seed()
    print("Splash bg → %s" % OPT_PATH)
    # Pull at 2x resolution so the downsample to 320×240 keeps detail crisp.
    if not download_to(prompt, RAW_PATH, width=W * 2, height=H * 2, seed=seed):
        print("Download failed.")
        sys.exit(1)
    img = Image.open(RAW_PATH).convert("RGB").resize((W, H), Image.LANCZOS)
    data = _pack_rgb565(img)
    _write_module(data)
    print("Wrote %s  (%.1f kB)" % (OPT_PATH, OPT_PATH.stat().st_size / 1024.0))


if __name__ == "__main__":
    main()
