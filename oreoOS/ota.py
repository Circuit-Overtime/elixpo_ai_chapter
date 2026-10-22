"""Over-the-air update client for OreoOS.

Update model
============
A "release" is a versioned manifest file pinned to a GitHub release of
the OreoOS repo. The manifest lists every file in the OS tree along
with its size and SHA-256, plus URLs to download each file.

CI publishes the release. The badge:

  1. Periodically (or on user request) hits the GitHub Releases API:
         GET https://api.github.com/repos/<OTA_REPO>/releases/latest
     and reads the asset called `manifest.json`.

  2. Compares manifest["version"] against oreoOS.config.VERSION.

  3. If newer, downloads every file whose local sha256 differs into the
     staging directory `/_ota/` on the badge's filesystem. Validates
     each file's hash. Writes the manifest itself last as a "ready"
     marker.

  4. Sets the OS settings flag `ota_pending=True`. The home screen
     surfaces an "Update ready, reboot to install" pill.

  5. On the next boot, `apply_pending()` runs BEFORE the launcher.
     If `/_ota/manifest.json` exists, every file under `/_ota/` is
     moved into its final location atomically (write-then-rename), the
     manifest is deleted, the staging directory removed, and the boot
     continues normally.

Why this shape
==============
* No partition swapping — the ESP32-S3 doesn't need OTA partitions for
  this, because we update files on the LittleFS filesystem rather than
  the MicroPython firmware itself. Bricking risk is bounded: if a file
  copy is interrupted, the manifest never lands and the OS keeps
  booting the old version.
* Manifest is JSON for human inspection and CI-side tooling. The
  badge's parser is the stdlib `json` module which MicroPython ships.
* Hash check on EVERY file before applying: a brownout during download
  can't corrupt the live OS because the bad bytes sit in the staging
  area until the manifest seals the deal.

Channels
========
A "channel" is a tag prefix on the GitHub release:
    stable/v1.3.0     -> stable channel
    beta/v1.4.0-rc1   -> beta channel
The OTA module fetches the latest release whose tag begins with the
channel name. Default is "stable" so badges don't auto-pick up rc
builds.
"""

import gc
import os as _os
import time

try:
    import urequests as _http
except ImportError:
    try:
        import requests as _http
    except ImportError:
        _http = None

try:
    import json as _json
except ImportError:
    _json = None

try:
    import hashlib as _hashlib
except ImportError:
    _hashlib = None


# ── tunables ────────────────────────────────────────────────────────────────

OTA_REPO       = "elixpo/oreo"      # owner/repo on GitHub
STAGE_DIR      = "/_ota"
MANIFEST_NAME  = "manifest.json"
DEFAULT_CHANNEL = "stable"
USER_AGENT     = "OreoBadge-OTA"

# Chunk size for download writes. Big enough to amortise FS overhead but
# small enough not to OOM the heap when downloading a 100 KB sprite.
CHUNK_BYTES    = 4096

# Anything below this counts as a "small patch" — auto-staged without
# pestering the user. Above it we pop a confirmation dialog because the
# user is on metered WiFi at a hackathon and 2 MB of new icons is rude.
SMALL_PATCH_BYTES = 80 * 1024     # 80 KB

# Timeouts (seconds). Every HTTP call uses one of these — no unbounded
# blocking is allowed because the OS run loop polls OTA from the
# background_check tail of every frame. A hung GET freezes the whole UI
# (input events queue up but no transitions happen) so the API probe is
# kept short. Tuned down from 10s -> 4s after on-device reports of
# "press A, OS stuck" — every frame was potentially eating a 10 s GET
# while GitHub's edge throttled the badge's IP.
T_GH_API       = 8         # GitHub releases API listing (per_page=10 keeps
                           # the body in the low single-KB range; 8 s is
                           # the slow-WiFi + SSL handshake headroom)
T_MANIFEST     = 4         # manifest.json download (tiny)
T_FILE         = 25        # individual file download (user-triggered)

# Don't auto-probe in the first minute of boot — gives the UI time to
# settle, lets the user open the home screen / press a button without
# eating a synchronous HTTP round-trip. Manual "Check Update" from
# Settings is unaffected: it calls check() directly.
_OTA_BOOT_GRACE_S = 15 * 60   # 15 min — boot finishes in seconds, but
                              # the user wants a clean post-boot
                              # experience without a probe-driven spike
                              # for at least one drink-of-water window.
                              # Manual "Check Update" from Settings is
                              # unaffected.


# ── helpers ─────────────────────────────────────────────────────────────────

def _ensure_dir(path):
    """mkdir -p equivalent for MicroPython's tiny os module."""
    parts = path.split("/")
    cur   = ""
    for p in parts:
        if not p:
            continue
        cur = cur + "/" + p if cur else p
        try:
            _os.mkdir(cur)
        except OSError:
            pass


def _rm_tree(path):
    """Best-effort ``rm -rf`` for a file or directory tree.

    MicroPython raises ``OSError`` when ``listdir`` receives a regular file.
    The old implementation swallowed that exception inside the recursive
    call, so the parent never reached its file-removal fallback.  As a
    result, no staged OTA file was deleted and ``manifest.json`` caused the
    same update to run after every reboot.
    """
    try:
        entries = _os.listdir(path)
    except OSError:
        try:
            _os.remove(path)
        except OSError:
            pass
        return

    for name in entries:
        _rm_tree(path + "/" + name)
    try:
        _os.rmdir(path)
    except OSError:
        pass


def _sha256_file(path):
    """SHA-256 of a file, hex-encoded. None if the file is missing."""
    if _hashlib is None:
        return None
    try:
        h = _hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                chunk = f.read(CHUNK_BYTES)
                if not chunk:
                    break
                h.update(chunk)
        return _hex(h.digest())
    except OSError:
        return None


def _hex(b):
    """Compatible hex encoding (some MP builds lack bytes.hex())."""
    try:
        return b.hex()
    except AttributeError:
        return "".join("%02x" % x for x in b)


def _current_version():
    try:
        from oreoOS.config import VERSION
        return VERSION
    except Exception:
        return "v0.0.0"


def _parse_version(s):
    """'v1.2.3' -> (1, 2, 3). Bad input -> (0, 0, 0)."""
    if not s:
        return (0, 0, 0)
    if s.startswith("v"):
        s = s[1:]
    try:
        parts = [int(x) for x in s.split(".")]
        while len(parts) < 3:
            parts.append(0)
        return tuple(parts[:3])
    except (TypeError, ValueError):
        return (0, 0, 0)


def _newer(a, b):
    """True iff version `a` (string) is strictly newer than `b`."""
    return _parse_version(a) > _parse_version(b)


def compare_version(a, b):
    """Public version-compare. Returns -1 / 0 / +1 (a vs b).
    Same semantics as cmp() on the parsed (maj, min, patch) tuples."""
    pa, pb = _parse_version(a), _parse_version(b)
    if pa == pb: return 0
    return 1 if pa > pb else -1


def latest_version(channel=DEFAULT_CHANNEL, on_progress=None):
    """Return (version_str, release_dict) for the most recent release
    on `channel`, regardless of whether it's newer than the device's
    current VERSION. (None, None) on network failure.

    Uses the lightweight /tags endpoint (~2 KB for 10 tags) to discover
    the version. The release dict is returned with `manifest_url=None`
    and empty `notes` — the heavy `/releases/latest` body is only
    fetched lazily by `check()` when the user actually wants to
    install or view the changelog. This keeps the version probe cheap
    enough to complete inside our 8 s API budget even on slow WiFi.

    Used by the Updates page to decide BETA / LTS / OUTDATED.
    """
    if _json is None:
        return None, None
    try:
        from oreoOS import _http as _httpx
    except Exception:
        return None, None
    body = _httpx.get_url(
        "https://api.github.com/repos/%s/tags?per_page=10" % OTA_REPO,
        accept="application/vnd.github+json", timeout_s=T_GH_API,
        on_progress=on_progress)
    if body is None:
        return None, None
    try:
        data = _json.loads(body.decode("utf-8"))
    except Exception:
        return None, None
    if not isinstance(data, list):
        return None, None
    prefix = channel + "/"
    for t in data:
        tag = t.get("name", "")
        if not (tag == channel or tag.startswith(prefix)):
            continue
        ver = tag[len(prefix):] if tag.startswith(prefix) else tag
        manifest_url = (
            "https://github.com/%s/releases/download/%s/%s"
            % (OTA_REPO, tag, MANIFEST_NAME))
        return ver, {
            "version":      ver,
            "notes":        "",
            "manifest_url": manifest_url,
            "tag":          tag,
            "major":        _is_major_bump(ver, _current_version()),
        }
    return None, None


def _is_major_bump(new_ver, cur_ver):
    """True when the MAJOR component changed (v1.x.x -> v2.x.x).

    Used to flag a release as a "breaking" update so the UI can warn the
    user. We treat a minor bump (1.2 -> 1.3) the same as a patch — the
    decision is binary because anything above patch can introduce new
    apps or change file layout.
    """
    a = _parse_version(new_ver)
    b = _parse_version(cur_ver)
    return a[0] != b[0]


# ── public API ──────────────────────────────────────────────────────────────

def check(channel=DEFAULT_CHANNEL):
    """Stage 1 — fast version probe. Hits GitHub's releases API and
    returns a thin dict iff a newer release exists.

    Result shape:
        {
            "version":      "v1.3.0",
            "notes":        "...",
            "manifest_url": "https://...",
            "tag":          "stable/v1.3.0",
            "major":        True/False,    # major-version bump?
        }

    Returns None on no-network / no-release / already-on-latest. Bounded
    to T_GH_API seconds so the caller can never hang on it.
    """
    # Delegate to the cheap /tags helper. `latest_version()` already
    # constructs the manifest_url from the tag, so we don't need a
    # second API call to read the full release body — which on this
    # repo can hit 3 MB and time out.
    cur = _current_version()
    ver, rel = latest_version(channel)
    if not ver or not rel:
        return None
    if not _newer(ver, cur):
        return None
    if not rel.get("manifest_url"):
        return None
    return rel


def peek(release, on_progress=None):
    """Stage 2 — fetch the manifest and compute a SHA-based diff.

    For every file in the manifest, compare the published SHA-256 to the
    hash of the local file at the same path. Files that match are
    skipped during the eventual download. The function returns the diff
    along with the total bytes the badge would need to fetch.

    Result shape:
        {
            "manifest":   {... full manifest dict ...},
            "changed":    [{path, url, sha256, size}, ...],
            "unchanged":  N,
            "bytes":      total bytes to download (size sum of `changed`),
            "small":      True iff bytes <= SMALL_PATCH_BYTES,
            "major":      True iff this is a major-version bump,
        }

    Returns None on any network / parse failure. Cheap to call — the
    manifest itself is a few KB. The expensive part (file-by-file
    download) lives in download().
    """
    if not release or _json is None:
        return None
    try:
        from oreoOS import _http as _httpx
    except Exception:
        return None
    body = _httpx.get_url(release["manifest_url"], timeout_s=T_MANIFEST,
                          on_progress=on_progress)
    if body is None:
        return None
    try:
        manifest = _json.loads(body.decode("utf-8"))
    except Exception:
        return None
    if not isinstance(manifest, dict):
        return None

    changed   = []
    unchanged = 0
    total_b   = 0
    for entry in manifest.get("files", ()):
        path = entry.get("path", "")
        want = entry.get("sha256", "")
        size = int(entry.get("size", 0) or 0)
        if not path:
            continue
        local_sha = _sha256_file(path)   # None when file is missing
        if want and local_sha == want:
            unchanged += 1
        else:
            changed.append(entry)
            total_b  += size

    return {
        "manifest":  manifest,
        "changed":   changed,
        "unchanged": unchanged,
        "bytes":     total_b,
        "small":     total_b <= SMALL_PATCH_BYTES,
        "major":     release.get("major", False) or _is_major_bump(
                        manifest.get("version", ""), _current_version()),
    }


def download(peeked, on_progress=None):
    """Stage 3 — download only the changed files into /_ota.

    `peeked` is the dict returned by peek(). Pre-passing it means the
    expensive SHA scan only happens once (during peek), not again here.

    on_progress(file_index, total_files, path) lets the UI render a
    progress bar. Every HTTP call is timeout-bounded so a hung server
    can't freeze the OS loop — the worst case is total = T_FILE * len(changed).
    """
    if not peeked:
        return False
    _rm_tree(STAGE_DIR)
    try:
        _os.mkdir(STAGE_DIR)
    except OSError:
        pass

    changed = peeked["changed"]
    total   = len(changed)
    for i, entry in enumerate(changed):
        path = entry.get("path", "")
        url  = entry.get("url", "")
        want = entry.get("sha256", "")
        if not (path and url):
            return False
        if not _download_file(url, path, want):
            return False
        if on_progress:
            try:
                on_progress(i + 1, total, path)
            except Exception:
                pass

    # Manifest written LAST as the all-good marker. Until this file
    # exists, apply_pending() won't promote anything from staging.
    try:
        with open(STAGE_DIR + "/" + MANIFEST_NAME, "w") as f:
            _json.dump(peeked["manifest"], f)
    except Exception:
        return False
    return True


def _download_file(url, dest_remote, expected_sha=None):
    """Download into the staging area mirroring the eventual remote path."""
    stage_path = STAGE_DIR + "/" + dest_remote
    parent = stage_path.rsplit("/", 1)[0]
    _ensure_dir(parent)
    try:
        from oreoOS import _http as _httpx
    except Exception:
        return False
    body = _httpx.get_url(url, timeout_s=T_FILE)
    if body is None:
        return False
    try:
        with open(stage_path, "wb") as f:
            f.write(body)
    except Exception:
        return False
    if expected_sha and _hashlib is not None:
        if _hex(_hashlib.sha256(body).digest()) != expected_sha:
            try:
                _os.remove(stage_path)
            except Exception:
                pass
            return False
    return True


def is_pending():
    """True iff a complete staged update is sitting in /_ota."""
    try:
        _os.stat(STAGE_DIR + "/" + MANIFEST_NAME)
        return True
    except OSError:
        return False


def apply_pending(on_progress=None):
    """Promote files from /_ota into their real locations. Returns the
    applied version string, or None if nothing was applied.

    SAFE to call on every boot: when no manifest is present it's a no-op.
    Called from launcher.boot() BEFORE anything else.
    """
    if _json is None:
        return None
    manifest_path = STAGE_DIR + "/" + MANIFEST_NAME
    try:
        with open(manifest_path) as f:
            manifest = _json.load(f)
    except Exception:
        return None

    files = manifest.get("files", ())
    total = len(files)
    for index, entry in enumerate(files):
        path = entry.get("path", "")
        if not path:
            continue
        src = STAGE_DIR + "/" + path
        dst = path
        try:
            _os.stat(src)
        except OSError:
            continue       # this file was skipped earlier (already up-to-date)
        # Write-then-rename style: ensure dst's parent exists, then copy.
        parent = dst.rsplit("/", 1)[0] if "/" in dst else ""
        if parent:
            _ensure_dir(parent)
        try:
            _copy_file(src, dst)
        except Exception:
            # Half-applied state is the worst case; the manifest still
            # exists so apply_pending() will retry on the next boot.
            return None
        if on_progress:
            try:
                on_progress(index + 1, path)
            except Exception:
                pass

    # All files are in place. Retire the ready marker first so even an
    # unexpected failure while removing the remaining staging tree cannot
    # make the next boot apply this release again.
    retired_path = STAGE_DIR + "/manifest.applied"
    try:
        _os.rename(manifest_path, retired_path)
    except OSError:
        try:
            _os.remove(manifest_path)
        except OSError:
            # Do not report success (and therefore do not reboot) while the
            # ready marker can still trigger another apply cycle.
            return None

    # The marker is gone; removing the payload is now best-effort and cannot
    # cause an update loop.
    _rm_tree(STAGE_DIR)
    gc.collect()
    return manifest.get("version", None)


def _copy_file(src, dst):
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        while True:
            chunk = fi.read(CHUNK_BYTES)
            if not chunk:
                break
            fo.write(chunk)


def discard_pending():
    """Forget any staged update without applying it.

    Used by the Settings 'cancel update' action so the badge doesn't
    apply a download the user changed their mind about.
    """
    _rm_tree(STAGE_DIR)


def background_check(os_obj, min_interval_s=6 * 3600):
    """Cheap periodic version probe — runs in the OS run-loop tail.

    Behaviour:
      * Disabled by default (see DISABLE flag below). The MicroPython
        urequests build on this firmware does NOT honour `timeout=` for
        the response body read — only the connect. When GitHub's edge
        keeps the socket open but never returns data, r.json() hangs
        FOREVER, freezing the OS run loop. Until we replace urequests
        with a raw-socket implementation that wraps settimeout() around
        every recv(), background probing is opt-in only via the
        `ota_bg_check` setting.
      * The manual "Check Update" row in Settings calls check() directly
        and remains available regardless of this flag.
      * Skips if WiFi isn't up.
      * Skips inside the boot grace window (_OTA_BOOT_GRACE_S).
      * Skips if a check ran in the last `min_interval_s` (6 h default).
      * On result, stashes flags on the OS settings dict.

    Returns True iff a new release was discovered this call.
    """
    # _http is the raw-socket helper at module scope; nothing to gate
    # on here since it lazy-imports inside check()/peek()/download().

    # Opt-out gate. Default ON because the boot-grace + 4 s API timeout
    # + 6 h rate-limit cap the worst-case freeze at 4 s once every 6 h,
    # which is tolerable. Users on a flaky GitHub edge can flip this off
    # via Settings if the cap turns out to leak through.
    try:
        if not os_obj.settings_get("ota_bg_check", True):
            return False
    except Exception:
        return False
    last = 0
    try:
        last = int(os_obj.settings_get("ota_last_check_s", 0) or 0)
    except Exception:
        pass
    try:
        now = int(time.time())
    except Exception:
        return False

    # Boot-grace: never probe in the first _OTA_BOOT_GRACE_S of uptime,
    # even if the persisted timestamp is missing or zero. Without this,
    # the very first frame after boot fires a synchronous HTTP GET and
    # the user sees "press A, stuck for 4 s" because the exiting frame
    # has to finish background_check before the next app loads.
    try:
        boot_ts = getattr(os_obj, "_boot_ts_s", None)
        if boot_ts is not None and (now - boot_ts) < _OTA_BOOT_GRACE_S:
            return False
    except Exception:
        pass

    if now - last < min_interval_s:
        return False

    # Only probe when there's a working network connection — silently
    # skips when offline so the boot is never gated on DNS. Also skip
    # entirely when the current SSID is flagged metered in /wifi.json,
    # so a phone hotspot or tethered connection isn't billed for
    # background traffic.
    try:
        from oreoWare import wifi
        if not wifi.is_connected():
            return False
        try:
            if wifi.is_metered():
                return False
        except Exception:
            pass
    except Exception:
        return False

    try:
        os_obj.settings_set("ota_last_check_s", now)
    except Exception:
        pass

    try:
        rel = check()
    except Exception:
        rel = None
    if not rel:
        try:
            os_obj.settings_set("ota_status", "up-to-date")
        except Exception:
            pass
        return False

    # New release found — surface it. The home-screen + launcher tile dot
    # render off these flags; the warn popup fires once per `version`.
    try:
        os_obj.settings_set("ota_status",            "needs-confirm")
        os_obj.settings_set("ota_pending_version",   rel.get("version", ""))
        os_obj.settings_set("ota_pending_major",     bool(rel.get("major")))
        # Reset the "have we already warned the user about THIS version"
        # flag so the popup fires once when the user sees a new dot.
        prev_warn_for = os_obj.settings_get("ota_warned_for_version", "")
        if prev_warn_for != rel.get("version", ""):
            os_obj.settings_set("ota_pending_warn_seen", False)
    except Exception:
        pass
    push_update_notification(rel.get("version", ""))
    return True


def push_update_notification(version):
    """De-duped 'Update available' push into the notification ring.

    Shared by background_check + the manual Check Update flow in
    Settings so both surfaces produce the same notif. Idempotent on
    version: if there's already a card for vX.Y.Z, this is a no-op.
    """
    if not version:
        return
    try:
        from oreoOS import notifications
        already = any(n.get("kind") == "ota" and n.get("body") == version
                      for n in notifications.items())
        if not already:
            notifications.push("ota", "Update available",
                               version, target="updates")
    except Exception:
        pass


def has_attention():
    """Single-call helper for the launcher: True iff the user should see a
    notification dot on the Settings tile + a one-shot warn popup."""
    return False    # populated by the launcher via os.settings_get()
