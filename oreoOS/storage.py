"""Filesystem accounting for OreoOS.

Walks the device root once and buckets every file into one of five
human-meaningful categories so the user can see at a glance what's
eating their 16 MB:

  system      OS + drivers + bundled assets (oreoOS/, oreoWare/, assets/,
              /main.py, /boot.py, /secrets.py)
  apps        per-app code/assets, EXCLUDING gallery content + caches
  gallery     incoming videos + baked/uploaded photos (gallery assets)
  documents   text / markdown landed via BT or sideload (documents/)
  misc        runtime caches, OTA staging, anything we didn't classify
              (apps/*/cache.txt, apps/*/state.txt, /_ota, /.deploy_hashes…)

Used by `apps/storage` and (read-only) by `tools/deploy.py`'s
free-space guard before a push.
"""

try:
    import os
except ImportError:
    os = None


# Display order matters — the Storage app paints buckets top-to-bottom.
BUCKETS = ("system", "apps", "gallery", "documents", "misc")

_SYSTEM_PREFIXES   = ("oreoOS/", "oreoWare/", "assets/")
_SYSTEM_FILES      = ("main.py", "boot.py", "secrets.py")
_GALLERY_PREFIX    = "apps/gallery/assets/"
_DOCUMENTS_PREFIX  = "documents/"
_MISC_PREFIXES     = ("_ota/", ".ota/", "ota_staging/")
_MISC_SUFFIXES     = ("cache.txt", "state.txt")
_MISC_FILES        = (".deploy_hashes.json",)


def _classify(path):
    """Return one of BUCKETS for an absolute path-without-leading-slash."""
    if path in _SYSTEM_FILES:
        return "system"
    for p in _SYSTEM_PREFIXES:
        if path.startswith(p):
            return "system"
    if path.startswith(_GALLERY_PREFIX):
        return "gallery"
    if path.startswith(_DOCUMENTS_PREFIX):
        return "documents"
    for p in _MISC_PREFIXES:
        if path.startswith(p):
            return "misc"
    if path in _MISC_FILES:
        return "misc"
    for s in _MISC_SUFFIXES:
        if path.endswith("/" + s) or path == s:
            return "misc"
    if path.startswith("apps/"):
        return "apps"
    return "misc"


def _walk(root):
    """Yield (path-relative-to-root, size_bytes) for every file under root.

    Uses os.listdir + os.stat — MicroPython has no os.walk on this build.
    """
    if os is None:
        return
    stack = [root]
    while stack:
        cur = stack.pop()
        try:
            entries = os.listdir(cur if cur else "/")
        except OSError:
            continue
        for name in entries:
            full = (cur + "/" + name) if cur else name
            try:
                st = os.stat(full)
            except OSError:
                continue
            mode = st[0]
            # MicroPython st_mode: 0x4000 = dir, 0x8000 = file
            if mode & 0x4000:
                if name == "__pycache__":
                    continue
                stack.append(full)
            else:
                yield full, st[6]


def buckets():
    """Return {bucket_name: {'bytes': int, 'count': int}} keyed by BUCKETS.

    Always emits every bucket (zero values when empty) so callers can
    iterate BUCKETS without KeyError handling.
    """
    out = {b: {"bytes": 0, "count": 0} for b in BUCKETS}
    for path, size in _walk(""):
        b = _classify(path)
        out[b]["bytes"] += size
        out[b]["count"] += 1
    return out


def fs_stats():
    """Total / used / free bytes from os.statvfs.

    On MicroPython, statvfs returns (f_bsize, f_frsize, f_blocks, f_bfree,
    f_bavail, f_files, f_ffree, f_favail, f_flag, f_namemax). We use
    f_frsize × f_blocks for total and f_frsize × f_bavail for free.
    """
    if os is None:
        return {"total": 0, "free": 0, "used": 0}
    try:
        s = os.statvfs("/")
    except Exception:
        return {"total": 0, "free": 0, "used": 0}
    frsize  = s[1]
    blocks  = s[2]
    bavail  = s[4]
    total = frsize * blocks
    free  = frsize * bavail
    return {"total": total, "free": free, "used": total - free}


def usage():
    """One-shot snapshot for UIs: {'stats': {...}, 'buckets': {...}}."""
    return {"stats": fs_stats(), "buckets": buckets()}
