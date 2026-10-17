"""Build an OreoOS OTA release manifest + bundle for GitHub Releases.

Usage:
    python tools/build_release.py                  # builds the current VERSION
    python tools/build_release.py --version v1.3.0 # builds an explicit version

Output (default into ./dist/<version>/):
    manifest.json     - listing of every shipped file, with sha256 + size
    files/<path>      - copy of each shipped file (mirrors device layout)
    bundle.tar        - everything in one tarball (alternative single-asset upload)

The CI workflow attaches `manifest.json` (and individually-named files,
or `bundle.tar`) to the GitHub Release. The badge's OTA client downloads
`manifest.json` first, then each individual file URL listed in it.

What goes in a release
======================
Everything `tools/deploy.py` would push to a badge EXCEPT:
  * secrets.py (generated on the fly from .env at deploy time)
  * any per-user caches (apps/*/cache.txt, apps/*/state.txt)
  * pycache, .deploy_hashes.json, raw assets

i.e. exactly what the runtime needs to boot the next version cleanly.
"""

import argparse
import hashlib
import json
import shutil
import sys
import tarfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


# Mirrors tools/deploy.py's DEPLOY list — these are the files that
# constitute a full OreoOS install. Kept in sync by hand for now; in a
# future tidy we can have deploy.py import this module.
SHIP_PATTERNS = [
    # OS + drivers
    "oreoOS/__init__.py",
    "oreoOS/_http.py",
    "oreoOS/config.py",
    "oreoOS/api.py",
    "oreoOS/app.py",
    "oreoOS/cache.py",
    "oreoOS/font.py",
    "oreoOS/gestures.py",
    "oreoOS/home.py",
    "oreoOS/icons.py",
    "oreoOS/launcher.py",
    "oreoOS/ota.py",
    "oreoOS/storage.py",
    "oreoOS/store.py",
    "oreoOS/notifications.py",
    "oreoOS/notif_panel.py",
    "oreoOS/pair_prompt.py",
    "oreoOS/http_server.py",
    "oreoOS/pixelfont.py",
    "oreoOS/power.py",
    "oreoOS/splash.py",
    "oreoOS/sprite.py",
    "oreoOS/theme.py",
    "oreoOS/timeutil.py",
    "oreoOS/widgets.py",
    "oreoOS/entry.py",
    "oreoWare/__init__.py",
    "oreoWare/_st7789.py",
    "oreoWare/battery.py",
    "oreoWare/bt.py",
    "oreoWare/buttons.py",
    "oreoWare/display.py",
    "oreoWare/imu.py",
    "oreoWare/ir.py",
    "oreoWare/os.py",
    "oreoWare/pins.py",
    "oreoWare/wifi.py",
]

# Glob-style trees that ship verbatim.
SHIP_GLOBS = [
    "assets/fonts/__init__.py",
    "assets/fonts/optimized/__init__.py",
    "assets/fonts/optimized/pixelify_*.py",
    "assets/icons/__init__.py",
    "assets/icons/optimized/__init__.py",
    "assets/icons/optimized/*.py",
    "assets/sprites/__init__.py",
    "assets/sprites/optimized/__init__.py",
    "assets/sprites/optimized/*.py",
    "assets/status/__init__.py",
    "assets/status/optimized/__init__.py",
    "assets/status/optimized/*.py",
    "assets/__init__.py",
    "apps/*/main.py",
    "apps/*/manifest.json",
    "apps/*/__init__.py",
    "apps/reader/assets/*.md",
    "apps/reader/assets/*.txt",
    "apps/*/assets/__init__.py",
    "apps/*/assets/optimized/__init__.py",
    "apps/*/assets/optimized/*.py",
]


def _collect_paths():
    """Return [(local_path, remote_path)] for every shipping file, sorted."""
    seen = set()
    out  = []
    def _add(p):
        rel = str(p.relative_to(REPO_ROOT))
        if rel in seen:
            return
        seen.add(rel)
        out.append((p, rel))

    for s in SHIP_PATTERNS:
        p = REPO_ROOT / s
        if p.exists():
            _add(p)

    for g in SHIP_GLOBS:
        for p in sorted(REPO_ROOT.glob(g)):
            if p.is_file() and "__pycache__" not in p.parts:
                _add(p)

    out.sort(key=lambda t: t[1])
    return out


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _read_version():
    """Pull the live VERSION constant from oreoOS/config.py."""
    sys.path.insert(0, str(REPO_ROOT))
    if "oreoOS.config" in sys.modules:
        del sys.modules["oreoOS.config"]
    from oreoOS.config import VERSION
    return VERSION


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", help="override the version string (default: read config.py)")
    ap.add_argument("--channel", default="stable",
                    help="release channel; tag will be <channel>/<version> (default: stable)")
    ap.add_argument("--notes",   default="",
                    help="release notes (free text; usually filled in by CI from the commit msg)")
    ap.add_argument("--asset-base-url", default="",
                    help="prefix prepended to each file's url field in the manifest. "
                         "GitHub Releases assets land at "
                         "https://github.com/<owner>/<repo>/releases/download/<tag>/<name>; "
                         "set this so OTA clients can find them. Empty = placeholder.")
    ap.add_argument("--out",     default="dist",
                    help="output directory root (default: dist/)")
    args = ap.parse_args()

    version  = args.version or _read_version()
    out_root = REPO_ROOT / args.out / version
    out_root.mkdir(parents=True, exist_ok=True)
    files_dir = out_root / "files"
    if files_dir.exists():
        shutil.rmtree(files_dir)
    files_dir.mkdir()

    files = []
    for local, remote in _collect_paths():
        # Copy into ./files/<remote>
        dest = files_dir / remote
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local, dest)

        # GitHub's release-assets upload endpoint rejects zero-byte files
        # with `HTTP 400: Bad Content-Length`. We have a lot of empty
        # __init__.py markers in the tree, so pad them to a single newline
        # in the COPY. The byte is semantically identical to an empty
        # __init__.py for MicroPython's import machinery, and re-hashing
        # the copy keeps the manifest in lockstep with what gh uploads.
        if dest.stat().st_size == 0:
            dest.write_bytes(b"\n")

        sha  = _sha256(dest)
        size = dest.stat().st_size

        # GitHub Releases assets are stored at one URL per file, named to
        # avoid path collisions. We flatten slashes to '_' for the
        # download URL while keeping the original `path` in the manifest.
        flat_name = remote.replace("/", "_")
        url = (args.asset_base_url + flat_name) if args.asset_base_url else flat_name
        files.append({
            "path":   remote,
            "url":    url,
            "size":   size,
            "sha256": sha,
        })

    manifest = {
        "version":  version,
        "channel":  args.channel,
        "tag":      "%s/%s" % (args.channel, version),
        "notes":    args.notes,
        "files":    files,
        "manifest_format": 1,
    }

    manifest_path = out_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    # Convenience tarball.
    bundle_path = out_root / "bundle.tar"
    with tarfile.open(bundle_path, "w") as tf:
        for local, remote in _collect_paths():
            tf.add(local, arcname=remote)

    print("Built release", version)
    print("  manifest:", manifest_path)
    print("  bundle:  ", bundle_path)
    print("  files:   ", len(files), "in", files_dir)


if __name__ == "__main__":
    main()
