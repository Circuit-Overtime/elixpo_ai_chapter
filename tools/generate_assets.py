"""Generate Oreo Badge assets via the Pollinations AI image API.

Top-level icons:
  python tools/generate_assets.py              # all active entries
  python tools/generate_assets.py home_bg

Per-app sprites (prompts/<app>/<name>.md → apps/<app>/assets/raw/<name>.png):
  python tools/generate_assets.py --app flappy           # all prompts under prompts/flappy/
  python tools/generate_assets.py --app flappy obstacle  # single sprite

Stickers (prompts/stickers/<name>.md → stickers/<name>.png at 1024x1024):
  python tools/generate_assets.py --stickers             # all 12 prompts
  python tools/generate_assets.py --stickers 01_hello    # single sticker
  python tools/generate_assets.py --stickers --seed 7    # different seed

Theme reference: prompts/THEME.md
"""

import os
import sys
import urllib.request
import urllib.parse
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

KEY   = os.getenv("POLLINATIONS_KEY")
BASE  = "https://gen.pollinations.ai/image"
MODEL = "gptimage"


def _read_prompt(path):
    """Read prompt text from a .md file (the block after '## Prompt')."""
    md = Path(path)
    if not md.exists():
        return None
    text = md.read_text()
    marker = "## Prompt"
    if marker in text:
        after = text.split(marker, 1)[1]
        lines = []
        for line in after.splitlines():
            if line.startswith("##"):
                break
            lines.append(line)
        return " ".join(l.strip() for l in lines if l.strip())
    return None


def download_to(prompt, out_path, width=200, height=200, seed=42):
    """Generic download — saves the generated PNG to out_path."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    print("→ %s  (%dx%d)\n  %s..." % (out_path, width, height, prompt[:90]))

    if not KEY:
        print("  ERROR: POLLINATIONS_KEY not set in .env — cannot authenticate")
        return False

    # NOTE: User-Agent is REQUIRED — the API returns 403 without it.
    headers = {
        "Authorization": "Bearer %s" % KEY,
        "User-Agent":    "OreoBadge/1.0"
    }
    enc = urllib.parse.quote(prompt)
    url = "%s/%s?width=%d&height=%d&seed=%d&nologo=true&model=%s" % (
        BASE, enc, width, height, seed, MODEL
    )

    for attempt in range(4):
        try:
            req  = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=90)
            data = resp.read()
            if len(data) < 1000:
                print("  WARN small (%d bytes), retry" % len(data))
                time.sleep(15 * (attempt + 1))
                continue
            out_path.write_bytes(data)
            print("  saved %d bytes  [model=%s]" % (len(data), MODEL))
            return True
        except urllib.error.HTTPError as e:
            # Read the response body so we can show *why* the server refused.
            try:
                body = e.read().decode("utf-8", "replace").strip()
            except Exception:
                body = ""
            short = (body[:600] + "…") if len(body) > 600 else body

            # 401/403/400 won't fix themselves — bail fast with the full message.
            if e.code in (400, 401, 403, 404, 422):
                print("  FATAL HTTP %d %s   [model=%s]" % (e.code, e.reason, MODEL))
                if body:
                    print("  ── server response ──")
                    for line in short.splitlines():
                        print("    " + line)
                    print("  ──────────────────────")
                else:
                    print("  (empty response body)")
                return False

            wait = 20 * (attempt + 1)
            print("  attempt %d HTTP %d %s — retry in %ds" %
                  (attempt + 1, e.code, e.reason, wait))
            if body:
                print("    server: " + short.splitlines()[0][:200])
            time.sleep(wait)
        except Exception as e:
            wait = 20 * (attempt + 1)
            print("  attempt %d error: %s — retry in %ds" % (attempt + 1, e, wait))
            time.sleep(wait)
    return False


def generate_stickers(only_names=None, seed=42, size=1024):
    """Generate the printable-sheet stickers.

    Reads prompts/stickers/*.md and writes stickers/<stem>.png at
    `size`x`size` (default 1024). Different from icons/app sprites:
    these aren't device assets — they're print artwork that gets
    composited into a sheet by tools/compile_sticker_sheet.py.
    """
    prompts_dir = Path("prompts") / "stickers"
    out_dir     = Path("stickers")

    if not prompts_dir.exists():
        print("No prompts directory at %s" % prompts_dir)
        return

    mds = sorted(prompts_dir.glob("*.md"))
    # Drop README.md if it's there — only numbered stickers should be
    # generated. Same `only_names` filter as the per-app mode for
    # picking single ones by stem (e.g. "01_hello").
    mds = [m for m in mds if m.stem.lower() != "readme"]
    if only_names:
        mds = [m for m in mds if m.stem in only_names]
    if not mds:
        print("No sticker .md prompt files in %s (after filtering)" % prompts_dir)
        return

    print("Generating %d sticker(s)  [%dx%d, seed=%d]...\n" %
          (len(mds), size, size, seed))

    # Defer the transparency import so users without Pillow can still
    # run the icon/app generators. If it's unavailable we just warn
    # and skip the post-step — raw cream PNGs are still useful.
    try:
        from tools.sticker_transparency import make_transparent  # type: ignore
        _alpha_ok = True
    except Exception:
        try:
            # Direct path when generate_assets is invoked as a script
            # (tools/ isn't on sys.path).
            sys.path.insert(0, str(Path("tools").resolve()))
            from sticker_transparency import make_transparent  # type: ignore
            _alpha_ok = True
        except Exception as e:
            print("  warn: transparency pass unavailable (%s)" % e)
            print("        run `python tools/sticker_transparency.py` later")
            make_transparent = None  # type: ignore
            _alpha_ok = False

    for md in mds:
        prompt = _read_prompt(md)
        if not prompt:
            print("  SKIP %s — no ## Prompt block" % md.name)
            continue
        out = out_dir / ("%s.png" % md.stem)
        ok = download_to(prompt, out, width=size, height=size, seed=seed)
        # Auto-strip the warm-cream background as soon as the file
        # lands. Done per-sticker (not in a final pass) so a
        # crash/interrupt mid-batch still leaves the already-generated
        # ones transparent. Fully in-place — same path overwritten.
        if ok and _alpha_ok and out.exists():
            try:
                make_transparent(out, out, tolerance=45)
                print("  alpha-stripped background")
            except Exception as e:
                print("  warn: transparency pass failed: %s" % e)
        time.sleep(8)
    print("\nDone. Run:  python tools/compile_sticker_sheet.py")


def generate_app(app_name, only_names=None, seed=42):
    """Generate all assets for one app: prompts/<app>/*.md → apps/<app>/assets/raw/*.png"""
    prompts_dir = Path("prompts") / app_name
    out_dir     = Path("apps") / app_name / "assets" / "raw"

    if not prompts_dir.exists():
        print("No prompts directory at %s" % prompts_dir)
        return

    mds = sorted(prompts_dir.glob("*.md"))
    if only_names:
        mds = [m for m in mds if m.stem in only_names]
    if not mds:
        print("No .md prompt files in %s" % prompts_dir)
        return

    print("Generating %d sprite(s) for app '%s'  [seed=%d]...\n" %
          (len(mds), app_name, seed))
    for md in mds:
        prompt = _read_prompt(md)
        if not prompt:
            print("  SKIP %s — no ## Prompt block" % md.name)
            continue
        out = out_dir / ("%s.png" % md.stem)
        download_to(prompt, out, width=200, height=200, seed=seed)
        time.sleep(8)
    print("\nDone. Run:  python tools/optimize_assets.py --app %s" % app_name)




# ── Active assets ──────────────────────────────────────────────────────────────
# Each entry: name → (width, height) or None to use default 200×200.
# Prompt text is read from prompts/<name>.md automatically.
# Comment out entries you don't want to regenerate.

ACTIVE = {
    # "home_bg":    (200, 200),
    # "apps_icon":  (200, 200),
    # "flappy_icon":  None,
    # "snake_icon":   None,
    # "gamepad_icon": None,
    # "commits_icon": None,
    # "settings_icon": None,
    # "bluetooth_icon": None,
    # "wifi_icon": None,
    # "about_icon": None,
    # "identity_icon": None,
    # "elixpo_pet_icon": None,
    # "elixpo_sketch_icon": None,
    # "IR_Quest_icon": None,
    # "commits_breaker_icon": None,
    # "wallpaper_icon": None,
    # "gallery_icon": None,
    # "flappy_panda_up":   None,
    # "flappy_panda_down": None,
}

# ── Inline fallback prompts (used if no .md file exists) ─────────────────────
# Edit the .md files in prompts/ instead — these are last-resort only.

_FALLBACK_PROMPTS = {}

# ── Style constants (appended to all prompts that don't have their own style) ─

PANDA_BASE = (
    "cute panda character with big eyes, black and white panda with pink cheeks, "
    "wearing a red badge with letter E on chest"
)

ICON_STYLE = (
    "pixel art cartoon style, thick dark outline, pastel vibrant colors, "
    "cute kawaii style, white background, square crop, no text, no watermark"
)

# ── Download ──────────────────────────────────────────────────────────────────

def download(name, width=200, height=200, seed=42):
    """Top-level icon: prompts/{name,icons/<name>}.md → assets/icons/raw/<name>.png."""
    prompt = (_read_prompt("prompts/%s.md" % name)
              or _read_prompt("prompts/icons/%s.md" % name)
              or _FALLBACK_PROMPTS.get(name))
    if not prompt:
        print("  SKIP %s — no prompt at prompts/%s.md or prompts/icons/%s.md"
              % (name, name, name))
        return
    download_to(prompt, "assets/icons/raw/%s.png" % name,
                width, height, seed=seed)


def _pop_seed(args):
    """Strip a `--seed N` pair from args. Returns (remaining_args, seed_int)."""
    seed = 42
    if "--seed" in args:
        i = args.index("--seed")
        if i + 1 < len(args):
            try:
                seed = int(args[i + 1])
            except ValueError:
                print("WARN: --seed expects an integer; using 42")
            args = args[:i] + args[i + 2:]
    return args, seed


def main():
    args, seed = _pop_seed(sys.argv[1:])

    # ── stickers mode ────────────────────────────────────────────────────────
    # Hardcoded 1024×1024 output. Any positional args after --stickers
    # are treated as stems to filter on (e.g. `--stickers 01_hello`),
    # mirroring the per-app mode's behaviour.
    if "--stickers" in args:
        idx  = args.index("--stickers")
        only = args[idx + 1:]
        generate_stickers(only_names=only or None, seed=seed)
        return

    # ── per-app mode ─────────────────────────────────────────────────────────
    if "--app" in args:
        idx  = args.index("--app")
        rest = args[idx + 1:]
        if not rest:
            print("Usage: generate_assets.py --app <app> [name ...] [--seed N]")
            return
        app, *only = rest
        generate_app(app, only_names=only or None, seed=seed)
        return

    # ── top-level icons mode ─────────────────────────────────────────────────
    targets = args
    active  = {k: v for k, v in ACTIVE.items()}
    if targets:
        active = {k: active.get(k, (200, 200)) for k in targets}
    if not active:
        print("No active entries. Uncomment entries in ACTIVE dict or pass names as args.")
        return

    print("Generating %d asset(s)  [seed=%d]...\n" % (len(active), seed))
    for name, dims in active.items():
        w, h = dims if dims else (200, 200)
        prompt = (_read_prompt("prompts/%s.md" % name)
                  or _read_prompt("prompts/icons/%s.md" % name)
                  or _FALLBACK_PROMPTS.get(name))
        if not prompt:
            print("  SKIP %s — no prompt at prompts/%s.md or prompts/icons/%s.md"
                  % (name, name, name))
            continue
        download_to(prompt, "assets/icons/raw/%s.png" % name, w, h, seed=seed)
        time.sleep(8)

    print("\nDone. Run:  python tools/optimize_assets.py")


if __name__ == "__main__":
    main()
