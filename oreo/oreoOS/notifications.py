"""In-memory notification ring for OreoOS.

Anything that wants to surface a transient event to the user calls
`push(kind, title, body, target=None)`. The launcher renders the panel
(C-button slide-down) by reading `items()`.

Kept entirely in RAM — these are transient. On reboot the panel is empty
again. Persistence isn't worth the flash wear for ephemeral status pings.

Producers wire in best-effort with `try: from oreoOS import notifications`
so oreoWare modules can call us without making oreoOS a hard dependency
(keeps the hardware layer importable standalone for tests).
"""

import time

MAX_ITEMS    = 12   # ring size — last 12 events kept, oldest evicted
_items       = []   # newest-first
_last_seen   = 0    # ts of the newest item the user has acknowledged


def _now():
    try:
        return time.time()
    except Exception:
        return 0


def push(kind, title, body="", target=None):
    """Drop a notification on top of the ring.

      kind   short string for icon/colour routing
             ("file" / "ota" / "wifi" / "bt" / "system")
      title  short headline, ~24 chars renders cleanly
      body   one-line subtitle, optional
      target app dir to launch when the user hits A on this entry, or None
    """
    item = {
        "ts":     _now(),
        "kind":   kind,
        "title":  title,
        "body":   body,
        "target": target,
    }
    _items.insert(0, item)
    if len(_items) > MAX_ITEMS:
        del _items[MAX_ITEMS:]


def items():
    """Newest-first list of notifications. Returns the live list — callers
    must not mutate it (use `clear()` / `remove_at()` instead)."""
    return _items


def unread_count():
    """How many entries are newer than the last mark_read() call."""
    n = 0
    for it in _items:
        if it["ts"] > _last_seen:
            n += 1
        else:
            break
    return n


def mark_read():
    """Stamp the read cursor at the newest item's ts (or now if empty)."""
    global _last_seen
    _last_seen = _items[0]["ts"] if _items else _now()


def clear():
    """Drop everything. Called when the user hits B in the panel."""
    _items[:] = []
    mark_read()


def remove_at(idx):
    """Drop a single entry. Used when the panel opens an item and we
    don't want it to re-trigger on the next look."""
    if 0 <= idx < len(_items):
        del _items[idx]
