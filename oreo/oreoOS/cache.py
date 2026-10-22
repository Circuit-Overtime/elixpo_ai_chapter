"""TTL-cached file storage for app data fetched over WiFi.

Apps that hit the network (Badge, Commits, Weather, future Identity sync)
all do the same dance:

  1. on entry: show whatever's in the cache so the screen isn't blank
  2. if the cache is older than TTL, fire a fresh fetch in the background
  3. when the fetch lands, swap the new data in + persist

This module wraps that into one function pair:

    from oreoOS.cache import save, load

    save("apps/badge/cache.txt", profile_dict)
    profile, age_s = load("apps/badge/cache.txt", ttl_s=3600)

`profile` is None when the file doesn't exist OR has expired past `ttl_s`;
`age_s` tells the caller how stale the cache was (so they can show
"updated 5 min ago" in the UI).

The serializer is intentionally text-based (key=value per line) because
MicroPython's filesystem can survive a partial write but its JSON parser
is mp_lexer-allocated and a corrupt file would crash the boot. A few
lines of `name=Ayushman` survive any abrupt reset.
"""

import time


def _now_s():
    """Wall-clock seconds since epoch (RTC) — used for TTL bookkeeping."""
    try:
        return int(time.time())
    except Exception:
        # On boards without a synced clock time.time() may raise; fall back
        # to ticks_ms() converted to seconds, which is monotonic-since-boot.
        return time.ticks_ms() // 1000


# ── tiny key=value serializer ───────────────────────────────────────────────
# We intentionally don't use JSON to avoid the parser-allocation cost on
# MicroPython. The values are coerced to str on write and returned as str
# on read; callers cast back to int / float / tuple as needed.

def _ser(obj):
    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            out.append("%s=%s" % (k, _esc(v)))
        return "\n".join(out)
    return _esc(obj)


def _esc(v):
    if isinstance(v, str):
        return v.replace("\\", "\\\\").replace("\n", "\\n")
    return str(v)


def _unesc(s):
    return s.replace("\\n", "\n").replace("\\\\", "\\")


def _deser(text):
    if "=" not in text:
        return _unesc(text)
    out = {}
    for line in text.splitlines():
        if not line or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = _unesc(v)
    return out


# ── public API ──────────────────────────────────────────────────────────────

def save(path, payload):
    """Write `payload` (dict OR scalar) to `path` with a timestamp header.

    On filesystem error we silently swallow — the cache is a nice-to-have,
    never required for correctness. Apps always show *something* (cached
    or fresh) so a write failure just means the next launch re-fetches.
    """
    try:
        with open(path, "w") as f:
            f.write("__ts=%d\n" % _now_s())
            f.write(_ser(payload))
        return True
    except Exception:
        return False


def load(path, ttl_s=None):
    """Return (payload, age_seconds) or (None, None).

    If `ttl_s` is given and the cache is older, the function still returns
    the payload but with `age_seconds > ttl_s`. The caller can decide:
        - render stale data immediately (always)
        - + kick off a background refresh when age_seconds > ttl_s.

    Returns (None, None) when the file doesn't exist OR the header is
    malformed. Apps treat that as "no cache, hit the network".
    """
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return None, None

    if not text.startswith("__ts="):
        # Pre-cache file or corrupt header — treat as no cache.
        return None, None
    first, _, rest = text.partition("\n")
    try:
        ts = int(first[5:])
    except ValueError:
        return None, None
    age = max(0, _now_s() - ts)
    return _deser(rest), age


def fresh(path, ttl_s):
    """Convenience: True iff the cache at `path` is younger than `ttl_s`."""
    _, age = load(path)
    return age is not None and age <= ttl_s


def invalidate(path):
    """Delete a cache file. Used when the user presses 'force refresh'."""
    try:
        import os as _os
        _os.remove(path)
        return True
    except Exception:
        return False
