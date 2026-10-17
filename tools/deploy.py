"""Deploy Oreo Badge OS to the ESP32-S3 via mpremote.

Usage:
    python tools/deploy.py                          # auto-detect port
    python tools/deploy.py /dev/ttyACM0
    python tools/deploy.py --clean                  # wipe device first
    python tools/deploy.py --website                # build + ship the
                                                    # Cloudflare Pages site
                                                    # in oreo.elixpo/ (no
                                                    # badge interaction)
    python tools/deploy.py --website --preview      # deploy to branch alias
                                                    # instead of production
    python tools/deploy.py --override=gallery,reader
        # before the push, wipe the named app dirs on device (and force
        # any of their files in our hash cache to re-push). Use this when
        # BT-uploaded photos / documents or Store-installed apps have
        # diverged on device and you want the laptop copy to win. Without
        # --override the device-side content for those apps is preserved.

Must be run from the project root.
"""

import sys
import re
import json
import hashlib
import subprocess
from pathlib import Path

PYTHON = sys.executable or "python3"

PORT = "/dev/ttyACM0"
for arg in sys.argv[1:]:
    if arg.startswith("/dev/") or "COM" in arg:
        PORT = arg

CLEAN  = "--clean" in sys.argv
FORCE  = "--force" in sys.argv     # bypass local hash cache, push everything
NOSKIP = CLEAN or FORCE

HASH_CACHE_PATH = Path(".deploy_hashes.json")

# Refuse to push if the device would be left with less than this many
# bytes of free flash post-deploy. Sized for OTA staging headroom
# (~500 KB peak) + a 250 KB image transfer + cache growth. Override on
# the CLI with `--free-floor=N` (bytes) when you really need it.
FREE_FLOOR_BYTES = 1 * 1024 * 1024     # 1 MB
for _arg in sys.argv[1:]:
    if _arg.startswith("--free-floor="):
        try:
            FREE_FLOOR_BYTES = int(_arg.split("=", 1)[1])
        except ValueError:
            pass
SKIP_FREE_GUARD = "--no-free-guard" in sys.argv

# --override=<csv>  -- list of app dir names to wipe on device BEFORE the
# push. The deploy still pushes the laptop copy afterwards, so the net
# effect is "force-replace these apps wholesale (including any BT-
# uploaded or store-installed content under them) with the repo state."
# Without this flag the device-side trees for these apps are left alone.
OVERRIDE_DIRS = []
for _arg in sys.argv[1:]:
    if _arg.startswith("--override="):
        OVERRIDE_DIRS = [s.strip() for s in _arg.split("=", 1)[1].split(",")
                         if s.strip()]
        break
    if _arg == "--override":
        # Bare `--override` defaults to the two trees that accumulate
        # device-side content most aggressively: gallery (BT photos) and
        # reader (BT documents). Cheap reset for the common case.
        OVERRIDE_DIRS = ["gallery", "reader"]
        break


def _hash_file(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _load_hash_cache():
    if NOSKIP or not HASH_CACHE_PATH.exists():
        return {}
    try:
        return json.loads(HASH_CACHE_PATH.read_text())
    except (OSError, ValueError):
        return {}


def _save_hash_cache(cache):
    try:
        HASH_CACHE_PATH.write_text(json.dumps(cache, indent=2, sort_keys=True))
    except OSError:
        pass


# ── version auto-bump ─────────────────────────────────────────────────────────

CONFIG_PATH      = Path("oreoOS/config.py")
_VERSION_PATTERN = re.compile(
    r'^(VERSION\s*=\s*")v(\d+)\.(\d+)\.(\d+)(")',
    re.MULTILINE,
)


def bump_patch_version():
    """Rewrite the VERSION literal in oreoOS/config.py, +1 to the patch.

    Returns (old, new) as strings, or (None, None) when no line matched
    (so the caller can warn instead of silently shipping a stale version).
    The file is edited in place — comments and the rest of the config
    are preserved because we only touch the matched line.
    """
    if not CONFIG_PATH.exists():
        return None, None
    text = CONFIG_PATH.read_text()
    m    = _VERSION_PATTERN.search(text)
    if not m:
        return None, None
    major, minor, patch = int(m.group(2)), int(m.group(3)), int(m.group(4))
    old = "v%d.%d.%d" % (major, minor, patch)
    new = "v%d.%d.%d" % (major, minor, patch + 1)
    new_line = "%s%s%s" % (m.group(1), new, m.group(5))
    CONFIG_PATH.write_text(text[:m.start()] + new_line + text[m.end():])
    return old, new

# ── Files and directories to deploy ──────────────────────────────────────────
# (local_path, remote_path)  — directories are copied recursively

DEPLOY = [
    # entry point — oreoOS.entry → /main.py on the device
    ("oreoOS/entry.py",         "main.py"),

    # OS layer (flat namespace: api, app, theme, widgets, font, …)
    ("oreoOS/__init__.py",      "oreoOS/__init__.py"),
    ("oreoOS/_http.py",         "oreoOS/_http.py"),
    ("oreoOS/config.py",        "oreoOS/config.py"),
    ("oreoOS/api.py",           "oreoOS/api.py"),
    ("oreoOS/app.py",           "oreoOS/app.py"),
    ("oreoOS/font.py",          "oreoOS/font.py"),
    ("oreoOS/pixelfont.py",     "oreoOS/pixelfont.py"),
    ("oreoOS/sprite.py",        "oreoOS/sprite.py"),
    ("oreoOS/home.py",          "oreoOS/home.py"),
    ("oreoOS/icons.py",         "oreoOS/icons.py"),
    ("oreoOS/launcher.py",      "oreoOS/launcher.py"),
    ("oreoOS/power.py",         "oreoOS/power.py"),
    ("oreoOS/splash.py",        "oreoOS/splash.py"),
    ("oreoOS/theme.py",         "oreoOS/theme.py"),
    ("oreoOS/timeutil.py",      "oreoOS/timeutil.py"),
    ("oreoOS/widgets.py",       "oreoOS/widgets.py"),
    ("oreoOS/cache.py",         "oreoOS/cache.py"),
    ("oreoOS/ota.py",           "oreoOS/ota.py"),
    ("oreoOS/storage.py",       "oreoOS/storage.py"),
    ("oreoOS/store.py",         "oreoOS/store.py"),
    ("oreoOS/notifications.py", "oreoOS/notifications.py"),
    ("oreoOS/notif_panel.py",   "oreoOS/notif_panel.py"),
    ("oreoOS/pair_prompt.py",   "oreoOS/pair_prompt.py"),
    ("oreoOS/http_server.py",   "oreoOS/http_server.py"),
    # Mascot image served at /mascot.png by the on-badge upload page.
    # Without this in the deploy manifest the file never makes it to
    # flash, so the local upload page renders a broken-image icon.
    ("oreoOS/mascot.png",       "oreoOS/mascot.png"),
    ("oreoOS/gestures.py",      "oreoOS/gestures.py"),

    # Hardware drivers
    ("oreoWare/__init__.py",    "oreoWare/__init__.py"),
    ("oreoWare/_st7789.py",     "oreoWare/_st7789.py"),
    ("oreoWare/buttons.py",     "oreoWare/buttons.py"),
    ("oreoWare/display.py",     "oreoWare/display.py"),
    ("oreoWare/battery.py",     "oreoWare/battery.py"),
    ("oreoWare/os.py",          "oreoWare/os.py"),
    ("oreoWare/pins.py",        "oreoWare/pins.py"),
    ("oreoWare/wifi.py",        "oreoWare/wifi.py"),
    ("oreoWare/bt.py",          "oreoWare/bt.py"),
    ("oreoWare/imu.py",         "oreoWare/imu.py"),
    ("oreoWare/ir.py",          "oreoWare/ir.py"),
]

# Pixelify Sans bitmap-font modules (.py only — skip the TTF, it's build-time)
_fonts_dir = Path("assets/fonts/optimized")
if _fonts_dir.exists():
    DEPLOY.append(("assets/fonts/__init__.py",
                   "assets/fonts/__init__.py"))
    DEPLOY.append(("assets/fonts/optimized/__init__.py",
                   "assets/fonts/optimized/__init__.py"))
    for _f in sorted(_fonts_dir.glob("pixelify_*.py")):
        DEPLOY.append((str(_f), "assets/fonts/optimized/" + _f.name))

APPS_DIR     = Path("apps")
_app_roots   = [APPS_DIR]
for _root in _app_roots:
    for app_dir in sorted(_root.iterdir()):
        if not app_dir.is_dir() or app_dir.name.startswith("_"):
            continue
        if not ((app_dir / "main.py").exists() and
                (app_dir / "manifest.json").exists()):
            continue
        rel = str(app_dir)
        DEPLOY += [
            ("%s/__init__.py" % rel,      "%s/__init__.py" % rel),
            ("%s/main.py" % rel,          "%s/main.py" % rel),
            ("%s/manifest.json" % rel,    "%s/manifest.json" % rel),
        ]

        # Optional src/ subtree for the modular-app convention:
        # apps/<name>/main.py is a thin shim that imports from
        # apps/<name>/src/. Python sources and architecture-matched dynamic
        # native .mpy helpers under src/ get pushed recursively so apps can
        # accelerate hot loops without rebuilding the whole firmware.
        # without touching the deploy script. We deliberately skip
        # __pycache__, .pyc, hidden files, and any subdirectory
        # named `tests/` (host-only — they pull in pytest etc).
        src_dir = app_dir / "src"
        if src_dir.is_dir():
            for sp in sorted(src_dir.rglob("*")):
                if not sp.is_file() or sp.suffix not in (".py", ".mpy"):
                    continue
                # Filter out everything we don't want on flash.
                parts = sp.relative_to(app_dir).parts
                if any(p == "__pycache__" or p.startswith(".") or
                       p == "tests" for p in parts):
                    continue
                rel_path = "/".join(parts)         # src/foo/bar.py
                DEPLOY.append((str(sp),
                               "%s/%s" % (rel, rel_path)))
        # Reader bundles plain .md / .txt files under assets/ (no optimize
        # step — they're already device-readable). README.md is a host-only
        # workflow doc and is excluded from the push.
        if app_dir.name == "reader":
            r_assets = app_dir / "assets"
            if r_assets.exists():
                for p in sorted(r_assets.iterdir()):
                    if not p.is_file():
                        continue
                    if p.name == "README.md":
                        continue
                    if p.suffix.lower() not in (".md", ".txt", ".mdz", ".txtz"):
                        continue
                    DEPLOY.append((str(p),
                                   "%s/assets/%s" % (rel, p.name)))

        # Per-app assets (only optimized .py modules, not raw images).
        # Gallery is special: filter the optimized list to ONLY the stems
        # that still have a corresponding raw image — old photos that the
        # user deleted from raw/ should also vanish from the device.
        opt = app_dir / "assets" / "optimized"
        if opt.exists():
            r_base = "%s/assets/optimized" % rel
            DEPLOY.append(("%s/assets/__init__.py" % rel, "%s/assets/__init__.py" % rel))
            DEPLOY.append(("%s/__init__.py" % opt, "%s/__init__.py" % r_base))

            raw_dir   = app_dir / "assets" / "raw"
            raw_stems = None
            if app_dir.name == "gallery" and raw_dir.exists():
                raw_stems = {
                    p.stem for p in raw_dir.iterdir()
                    if p.suffix.lower() in (".png", ".jpg", ".jpeg")
                }

            for py in sorted(opt.glob("*.py")):
                if py.name == "__init__.py":
                    continue
                if raw_stems is not None and py.stem not in raw_stems:
                    # The matching raw image was removed — don't push the
                    # stale optimized module. The device-side cleanup below
                    # will remove it from flash on the next deploy.
                    continue
                DEPLOY.append((str(py), "%s/%s" % (r_base, py.name)))

            # Gallery can also ship host-encoded streaming videos. Unlike
            # WiFi-uploaded clips these are intentional firmware assets and
            # are included by --force / --override=gallery deployments.
            if app_dir.name == "gallery":
                for photo in sorted(opt.glob("*.rz565")):
                    DEPLOY.append((str(photo), "%s/%s" %
                                   (r_base, photo.name)))
                for video in sorted(opt.glob("*.rv565")):
                    DEPLOY.append((str(video), "%s/%s" %
                                   (r_base, video.name)))

# assets — only the optimized .py modules (not raw PNGs/SVGs)
for subdir in ["icons", "sprites", "status"]:
    opt = Path("assets") / subdir / "optimized"
    if opt.exists():
        remote_base = "assets/%s/optimized" % subdir
        DEPLOY.append(("%s/__init__.py" % opt, "%s/__init__.py" % remote_base))
        for py in sorted(opt.glob("*.py")):
            if py.name == "__init__.py":
                continue
            DEPLOY.append((str(py), "%s/%s" % (remote_base, py.name)))
        # parent __init__ files
        parent_local  = "assets/%s/__init__.py" % subdir
        parent_remote = "assets/%s/__init__.py" % subdir
        if Path(parent_local).exists():
            DEPLOY.append((parent_local, parent_remote))

DEPLOY.append(("assets/__init__.py", "assets/__init__.py"))


# ── helpers ───────────────────────────────────────────────────────────────────

def run(cmd, check=True):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        # Print the FULL stderr (and any stdout) so mpremote tracebacks aren't
        # truncated mid-line. Helps diagnose "Cannot reach device" failures
        # where the actual cause was a Python compat error or timeout.
        print("  ERROR  (rc=%d, cmd=%s):" % (result.returncode, " ".join(cmd)))
        if result.stderr:
            print("  --- stderr ---")
            print(result.stderr.rstrip())
        if result.stdout:
            print("  --- stdout ---")
            print(result.stdout.rstrip())
    return result


def mpremote(*args):
    return run([PYTHON, "-m", "mpremote", "connect", PORT] + list(args))


def _device_free_bytes():
    """Query the device's free flash via statvfs. Returns bytes, or None
    on failure (no device / unexpected output)."""
    r = run([PYTHON, "-m", "mpremote", "connect", PORT, "exec",
             "import os\n"
             "s=os.statvfs('/')\n"
             "print('FREE=%d' % (s[1]*s[4]))"], check=False)
    if r.returncode != 0:
        return None
    for line in (r.stdout or "").splitlines():
        if line.startswith("FREE="):
            try:
                return int(line[5:].strip())
            except ValueError:
                return None
    return None


def _human_size(n):
    if n >= 1024 * 1024:
        return "%.1f MB" % (n / 1024 / 1024)
    if n >= 1024:
        return "%.1f kB" % (n / 1024)
    return "%d B" % n


def _progress_bar(cur, total, width=24):
    filled = int(width * cur / max(1, total))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def mpremote_batch(actions, label=""):
    """Stream changed files through mpremote's binary mounted-FS protocol.

    `mpremote fs cp` encodes each 256-byte block inside a Python command. That
    is reliable for tiny scripts, but random binary data expands to several
    times its original size and pays a raw-REPL round trip for every block.
    A Gallery video can consequently take 10+ minutes.

    Mounting the repository at `/remote` uses mpremote's binary filesystem
    channel instead. One device-side loop reads each local file and writes it
    to flash in 249-byte blocks (mpremote's safe USB-stdin ring-buffer size).
    Each destination is staged as `.part`, so an interrupted transfer does not
    truncate the currently working file.
    """
    if label:
        print(label)

    unsupported = [a for a in actions if a[0] != "cp"]
    if unsupported:
        print("  ERROR: fast push only supports copy actions")
        return 2

    root = Path.cwd().resolve()
    copies = []
    for a in actions:
        local = Path(a[1]).resolve()
        try:
            mounted_path = "/remote/" + local.relative_to(root).as_posix()
        except ValueError:
            print("  ERROR: refusing to mount-copy a file outside the project: %s" % local)
            return 2
        try:
            size = local.stat().st_size
        except OSError as exc:
            print("  ERROR: cannot stat %s: %s" % (local, exc))
            return 2
        remote = "/" + a[2].lstrip("/")
        copies.append((mounted_path, remote, size, a[1]))

    # Keep this program compatible with MicroPython: no context managers,
    # pathlib, f-strings, or CPython-only APIs run on the badge.
    device_files = [(src, dst, size) for src, dst, size, _ in copies]
    copy_script = "import os\nfiles=%r\nbuf=bytearray(249)\n" % (device_files,)
    copy_script += (
        "for idx,item in enumerate(files):\n"
        " src,dst,size=item\n"
        " tmp=dst+'.part'\n"
        " try: os.remove(tmp)\n"
        " except OSError: pass\n"
        " inp=open(src,'rb')\n"
        " out=open(tmp,'wb')\n"
        " try:\n"
        "  while True:\n"
        "   n=inp.readinto(buf)\n"
        "   if not n: break\n"
        "   out.write(memoryview(buf)[:n])\n"
        " finally:\n"
        "  inp.close()\n"
        "  out.close()\n"
        " try: os.remove(dst)\n"
        " except OSError: pass\n"
        " os.rename(tmp,dst)\n"
        " print('@@PUSH|%d|%d|%s' % (idx+1,size,dst))\n"
    )

    cmd = [PYTHON, "-m", "mpremote", "connect", PORT,
           "mount", ".", "+", "exec", copy_script]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    total_cp = len(copies)
    done = 0
    new_bytes = 0

    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        if line.startswith("Local directory "):
            continue
        if line.startswith("@@PUSH|"):
            parts = line.split("|", 3)
            if len(parts) == 4:
                try:
                    done = int(parts[1])
                    size = int(parts[2])
                except ValueError:
                    print("    " + line)
                    continue
                new_bytes += size
                bar = _progress_bar(done, total_cp)
                print("  [%03d/%03d] %s  %-40s  %8s" %
                      (done, total_cp, bar, parts[3][-40:], _human_size(size)))
                continue
        print("    " + line)

    rc = proc.wait()
    print("  ── %d/%d files streamed (%s)   exit=%d" %
          (done, total_cp, _human_size(new_bytes), rc))
    return rc


def write_secrets_local():
    """Generate a local .secrets_tmp.py by importing the project's config.py.

    config.py is the single source of truth: non-secret values are edited
    inline there, secrets come from .env. This function just snapshots every
    public attribute of config and emits a flat module on the device, so
    apps can `from secrets import GITHUB_USER, OWM_API_KEY, ...` with no
    filesystem dance at runtime.

    Returns (path_to_tmp_file, wifi_ssid_for_logging).
    """
    # Import the project config from the repo root.
    import sys as _sys
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in _sys.path:
        _sys.path.insert(0, project_root)
    # Drop any cached config so .env edits between deploys are picked up.
    for k in ("config", "oreoOS.config"):
        if k in _sys.modules:
            del _sys.modules[k]
    from oreoOS import config as _cfg

    fields = (
        # name              python repr formatter
        # WIFI_SSID / WIFI_PASSWORD remain (as the FIRST entry from
        # the .env CSV) so older code paths that read them still
        # work. WIFI_NETWORKS is the canonical list that wifi.py
        # merges into /wifi.json at boot.
        ("WIFI_SSID",        "%r"),
        ("WIFI_PASSWORD",    "%r"),
        ("WIFI_NETWORKS",    "%r"),
        ("WIFI_AUTO_CONNECT","%r"),
        ("BT_AUTO_ENABLE",   "%r"),
        ("GITHUB_USER",      "%r"),
        ("DISPLAY_NAME",     "%r"),
        ("DESIGNATION",      "%r"),
        ("OWM_API_KEY",      "%r"),
        ("WEATHER_LAT",      "%s"),
        ("WEATHER_LON",      "%s"),
        ("WEATHER_NAME",     "%r"),
        ("TIMEZONE_OFFSET",  "%s"),
        ("WIFI_TX_DBM",      "%s"),
        ("WIFI_POWERSAVE",   "%r"),
        ("BT_ADV_INTERVAL_MS","%s"),
    )
    out = ["# Auto-generated by tools/deploy.py from config.py + .env — do not commit."]
    for name, fmt in fields:
        out.append(("%-18s = " + fmt) % (name, getattr(_cfg, name, "")))
    out.append("")

    tmp = Path(".secrets_tmp.py")
    tmp.write_text("\n".join(out))
    return tmp, getattr(_cfg, "WIFI_SSID", "")


# ── build directory set ────────────────────────────────────────────────────────

remote_dirs = set()
for local, remote in DEPLOY:
    # Include every ancestor. After --clean the top-level apps/ directory no
    # longer exists, so trying os.mkdir("apps/about") first just raises ENOENT.
    # The old code ignored that error and the batch later failed misleadingly
    # while copying apps/about/__init__.py.
    parent = Path(remote).parent
    while str(parent) != ".":
        remote_dirs.add(str(parent))
        parent = parent.parent

# sort so parents are created before children
remote_dirs = sorted(remote_dirs, key=lambda p: p.count("/"))


# ── website deploy ───────────────────────────────────────────────────────────

WEBSITE_DIR    = Path("oreo.elixpo")
WEBSITE_PROJECT = "oreo"        # Cloudflare Pages project name

def deploy_website():
    """Build the Next.js static export and push it to Cloudflare Pages.
    Production by default; pass `--preview` for a branch-alias deploy.

    The site lives in oreo.elixpo/ and exports to oreo.elixpo/out/. We
    shell out to the project's own `next build` + `wrangler pages
    deploy` so behaviour stays identical whether the user runs this
    helper or the package.json `deploy` script directly.
    """
    if not WEBSITE_DIR.is_dir():
        print("Cannot find website directory: %s/" % WEBSITE_DIR)
        sys.exit(1)
    preview = "--preview" in sys.argv

    print("Building Next.js static export in %s/..." % WEBSITE_DIR)
    rc = subprocess.call(["npx", "next", "build"], cwd=str(WEBSITE_DIR))
    if rc != 0:
        print("next build failed (exit %d)" % rc)
        sys.exit(rc)

    out_dir = WEBSITE_DIR / "out"
    if not out_dir.is_dir():
        print("Build did not produce %s/" % out_dir)
        sys.exit(1)

    # `--branch=main` pins the deploy to the production alias so the
    # custom domain (oreo.elixpo.com) actually serves the new bytes.
    # Without it wrangler defaults to the current git branch, which
    # only updates the branch-alias preview URL.
    cmd = ["npx", "wrangler", "pages", "deploy", "out",
           "--project-name=" + WEBSITE_PROJECT]
    if not preview:
        cmd.append("--branch=main")
    print("Deploying to Cloudflare Pages (%s)..." %
          ("preview" if preview else "production"))
    rc = subprocess.call(cmd, cwd=str(WEBSITE_DIR))
    if rc != 0:
        print("wrangler deploy failed (exit %d)" % rc)
        sys.exit(rc)
    print("Website deploy complete.")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    # Website-only path — short-circuits everything ESP-related so the
    # user can ship the site without a badge attached.
    if "--website" in sys.argv:
        deploy_website()
        return

    import time as _t
    t0 = _t.time()
    if "--no-bump" not in sys.argv:
        old, new = bump_patch_version()
        if new:
            print("Version: %s → %s" % (old, new))
        else:
            print("Version: could not locate VERSION line in %s — skipping bump"
                  % CONFIG_PATH)
    print("Deploying Oreo Badge OS → %s\n" % PORT)

    # Verify device reachable
    r = mpremote("fs", "ls", ":")
    if r.returncode != 0:
        print("Cannot reach device on %s. Check USB cable and port." % PORT)
        sys.exit(1)

    if OVERRIDE_DIRS:
        # Wipe the specified app trees on device. We do this BEFORE the
        # hash-cache scan so the entries we just nuked get re-pushed in
        # this same run rather than waiting for --force.
        print("Override: wiping device-side apps/{%s}/..."
              % ",".join(OVERRIDE_DIRS))
        wipe_script = (
            "import os\n"
            "def _rm(p):\n"
            "    try:\n"
            "        for f in os.listdir(p): _rm(p + '/' + f)\n"
            "        os.rmdir(p)\n"
            "    except OSError:\n"
            "        try: os.remove(p)\n"
            "        except: pass\n"
            "for d in %r:\n"
            "    path = 'apps/' + d\n"
            "    try:\n"
            "        os.stat(path)\n"
            "    except OSError:\n"
            "        continue\n"
            "    print('  wipe apps/' + d)\n"
            "    _rm(path)\n"
        ) % list(OVERRIDE_DIRS)
        mpremote("exec", wipe_script)
        # Drop hash-cache entries under the wiped dirs so the push step
        # re-uploads every file (otherwise the cache would say "already
        # there" and skip them, and the device would be left empty).
        cache_path = HASH_CACHE_PATH
        if cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text())
            except Exception:
                cached = {}
            prefixes = tuple("apps/%s/" % d for d in OVERRIDE_DIRS)
            kept = {k: v for k, v in cached.items()
                    if not k.startswith(prefixes)}
            dropped = len(cached) - len(kept)
            if dropped:
                cache_path.write_text(json.dumps(kept))
                print("  dropped %d hash-cache entr%s under override dirs"
                      % (dropped, "y" if dropped == 1 else "ies"))
        print()

    if CLEAN:
        print("Wiping device filesystem...")
        mpremote("exec",
                 "import os\n"
                 "def _rm(p):\n"
                 "    try:\n"
                 "        for f in os.listdir(p): _rm(p + '/' + f)\n"
                 "        os.rmdir(p)\n"
                 "    except OSError:\n"
                 "        try: os.remove(p)\n"
                 "        except: pass\n"
                 "for f in os.listdir('/'):\n"
                 "    if f != 'boot.py': _rm('/' + f)\n")
        # A wiped device has no files left to match the host-side cache.
        # Keeping stale hashes here would make --clean skip nearly the entire
        # OS and leave the badge unbootable.
        try:
            HASH_CACHE_PATH.unlink()
            print("  cleared host hash cache after device wipe")
        except FileNotFoundError:
            pass
        print()

    # Create all directories in one device-side exec (ignores "File exists")
    print("Creating directories (single exec)...")
    mkdir_script = (
        "import os\n"
        "for d in %r:\n"
        "    try: os.mkdir(d)\n"
        "    except OSError: pass\n"
    ) % list(remote_dirs)
    mpremote("exec", mkdir_script)

    # Build cp action list, skipping files whose hash matches the local cache.
    cache       = _load_hash_cache()
    new_cache   = dict(cache)
    actions     = []
    files       = []
    skipped_pre = 0
    for local, remote in DEPLOY:
        if not Path(local).exists():
            print("SKIP  %s (not found locally)" % local)
            continue
        try:
            h = _hash_file(local)
        except OSError:
            h = None
        if h is not None and cache.get(remote) == h:
            skipped_pre += 1
            continue
        files.append((local, remote))
        actions.append(("cp", local, remote))
        if h is not None:
            new_cache[remote] = h

    # Generate secrets before comparing it with the cache. Hashing the rendered
    # file still notices .env changes, without unconditionally writing the same
    # tiny module on every deploy.
    secrets_tmp, ssid = write_secrets_local()
    secrets_hash = _hash_file(secrets_tmp)
    if cache.get("secrets.py") != secrets_hash:
        actions.append(("cp", str(secrets_tmp), "secrets.py"))
        new_cache["secrets.py"] = secrets_hash
    else:
        skipped_pre += 1

    # Gallery sync: remove device-side .py files whose raw counterpart has
    # been deleted locally. Frees flash from past uploads and keeps the
    # carousel showing only the photos the user actually has in raw/.
    gallery_raw = Path("apps/gallery/assets/raw")
    if gallery_raw.exists():
        keep = sorted({
            p.stem for p in gallery_raw.iterdir()
            if p.suffix.lower() in (".png", ".jpg", ".jpeg")
        })
        cleanup = (
            "import os\n"
            "keep = set(%r)\n"
            "keep.add('__init__')\n"
            "d = 'apps/gallery/assets/optimized'\n"
            "try:\n"
            "    for f in os.listdir(d):\n"
            "        if f.endswith('.py') and f[:-3] not in keep:\n"
            "            try: os.remove(d + '/' + f)\n"
            "            except OSError: pass\n"
            "except OSError: pass\n"
        ) % keep
        print("  pruning stale gallery photos on device (keep=%d)" % len(keep))
        mpremote("exec", cleanup)
    repo_apps = sorted({
        p.name for p in Path("apps").iterdir()
        if p.is_dir() and (p / "main.py").exists()
            and (p / "manifest.json").exists()
            and not p.name.startswith("_")
    })
    apps_prune = (
        "import os\n"
        "keep = set(%r)\n"
        "def _rm(p):\n"
        "    try:\n"
        "        for f in os.listdir(p): _rm(p + '/' + f)\n"
        "        os.rmdir(p)\n"
        "    except OSError:\n"
        "        try: os.remove(p)\n"
        "        except: pass\n"
        "try:\n"
        "    for d in os.listdir('apps'):\n"
        "        if d in keep or d.startswith('_') or d == '__init__.py':\n"
        "            continue\n"
        "        try:\n"
        "            os.stat('apps/' + d + '/manifest.json')\n"
        "        except OSError:\n"
        "            continue\n"
        "        print('  prune apps/' + d)\n"
        "        _rm('apps/' + d)\n"
        "except OSError: pass\n"
    ) % repo_apps
    print("  pruning stale apps on device (keep=%d)" % len(repo_apps))
    mpremote("exec", apps_prune)

    cache_state = "miss" if not cache else "hit (%d entries)" % len(cache)
    print("  hash cache: %s   |   to push: %d   skipped: %d"
          % (cache_state, len(actions), skipped_pre))
    if skipped_pre and len(cache) == 0:
        print("  (cache was empty — first run after a hash-cache reset will push everything)")

    # ── free-space guard ────────────────────────────────────────────────
    # Sum the bytes we're about to push (only files that aren't hash-cache
    # hits) and refuse the deploy if the device would be left below the
    # floor afterwards. The device-side measurement uses statvfs so it
    # accounts for FS overhead the local file size misses.
    if not SKIP_FREE_GUARD and actions:
        projected_bytes = 0
        for _, local, _ in actions:
            try:
                projected_bytes += Path(local).stat().st_size
            except OSError:
                pass
        free_bytes = _device_free_bytes()
        if free_bytes is None:
            print("  free-space guard: could not read device statvfs — skipping check")
        else:
            projected_free = free_bytes - projected_bytes
            print("  free-space guard: device free=%s, push=%s, post-deploy=%s, floor=%s"
                  % (_human_size(free_bytes), _human_size(projected_bytes),
                     _human_size(projected_free), _human_size(FREE_FLOOR_BYTES)))
            if projected_free < FREE_FLOOR_BYTES:
                deficit = FREE_FLOOR_BYTES - projected_free
                print()
                print("  ABORTING: this deploy would leave only %s free "
                      "(floor is %s, short by %s)."
                      % (_human_size(max(0, projected_free)),
                         _human_size(FREE_FLOOR_BYTES),
                         _human_size(deficit)))
                print("  Free up space (delete photos / documents / caches) "
                      "or rerun with --no-free-guard to override.")
                secrets_tmp.unlink(missing_ok=True)
                sys.exit(2)
    print()

    push_t0 = _t.time()
    try:
        if actions:
            rc = mpremote_batch(
                actions,
                label="Streaming %d changed files over the binary channel..."
                      % len(actions),
            )
        else:
            print("No changed files to push.")
            rc = 0
    finally:
        secrets_tmp.unlink(missing_ok=True)
    push_elapsed = _t.time() - push_t0
    print("  binary stream took %.1fs" % push_elapsed)

    # Only trust queued hashes after the complete mpremote batch succeeds.
    # Saving them after an interrupted/failed --force run marks partial files
    # as installed and makes the next normal deploy skip repairs.
    if rc == 0:
        _save_hash_cache(new_cache)
    else:
        print("  hash cache unchanged because the batch did not complete")

    elapsed = _t.time() - t0
    if rc == 0:
        print("\nDone in %.1fs.  WIFI_SSID=%r" % (elapsed, ssid or "<unset>"))
        print("Resetting device...")
        mpremote("reset")
        print("Oreo OS is booting.")
    else:
        print("\nBatch exited with code %d after %.1fs (cache not changed)." %
              (rc, elapsed))


if __name__ == "__main__":
    main()
