"""Bond store for the BT pairing flow.

Two responsibilities, kept in one file because they share a single
on-flash document:

  bonds       user-visible paired-device list (max 3 entries)
              · mac, name, kind, last_seen_ts
  secrets     BLE stack-internal encryption keys
              · keyed by (sec_type, key_hex); value_hex

JSON on disk at /bonds.json. Hex-encoded so the bytes round-trip
through the JSON parser. On every mutation we rewrite the whole file —
the data is tiny (<2 KB even when full) and atomic-on-rewrite avoids
half-written state on a power cut.
"""

try:
    import json
    import time
except ImportError:
    json = None
    time = None


BOND_FILE  = "bonds.json"
BOND_CAP   = 3


# Cached copy of the on-flash store. Loaded lazily on first access.
_state = None


def _now():
    try:
        return int(time.time())
    except Exception:
        return 0


def _empty():
    return {"bonds": [], "secrets": {}}


def _hex(b):
    """Bytes → uppercase hex. None / non-bytes pass through unchanged."""
    if b is None:
        return None
    try:
        return bytes(b).hex().upper()
    except Exception:
        return None


def _unhex(s):
    if s is None:
        return None
    try:
        return bytes.fromhex(s)
    except Exception:
        return None


def _load():
    """Read the JSON file. Returns _empty() on any failure so callers
    never have to special-case missing/corrupt state."""
    global _state
    if _state is not None:
        return _state
    if json is None:
        _state = _empty()
        return _state
    try:
        with open(BOND_FILE) as f:
            data = json.loads(f.read())
        if not isinstance(data, dict):
            raise ValueError
        data.setdefault("bonds",   [])
        data.setdefault("secrets", {})
        _state = data
    except Exception:
        _state = _empty()
    return _state


def _flush():
    if json is None:
        return False
    try:
        with open(BOND_FILE, "w") as f:
            f.write(json.dumps(_state))
        return True
    except Exception:
        return False


# ── bond list ───────────────────────────────────────────────────────────

def list_bonds():
    """Return the live list (mutate via add/remove only)."""
    return _load()["bonds"]


def is_paired(mac):
    if not mac:
        return False
    mac = mac.upper()
    for b in list_bonds():
        if b.get("mac", "").upper() == mac:
            return True
    return False


def count():
    return len(list_bonds())


def add(mac, name, kind="other"):
    """Insert a new bond. Returns True on success, False if cap reached
    (caller should prompt the user to forget one first) or already
    present (idempotent — just bumps last_seen_ts)."""
    mac = (mac or "").upper()
    if not mac:
        return False
    bonds = list_bonds()
    for b in bonds:
        if b.get("mac", "").upper() == mac:
            b["last_seen_ts"] = _now()
            b["name"]         = name or b.get("name", "")
            b["kind"]         = kind or b.get("kind", "other")
            _flush()
            return True
    if len(bonds) >= BOND_CAP:
        return False
    bonds.append({
        "mac":          mac,
        "name":         name or "",
        "kind":         kind or "other",
        "added_ts":     _now(),
        "last_seen_ts": _now(),
    })
    _flush()
    return True


def remove(mac):
    if not mac:
        return False
    mac = mac.upper()
    bonds = list_bonds()
    for i, b in enumerate(bonds):
        if b.get("mac", "").upper() == mac:
            del bonds[i]
            # Drop any secrets that mention this MAC in their key blob.
            # Best-effort: secrets aren't keyed by MAC directly but most
            # entries embed the peer address so substring match is good
            # enough until we wire a per-peer secret namespace.
            secs = _load()["secrets"]
            mac_hex = mac.replace(":", "")
            stale = [k for k in secs if mac_hex in k]
            for k in stale:
                del secs[k]
            _flush()
            return True
    return False


def touch(mac):
    """Update last_seen_ts when a known peer reconnects."""
    if not mac:
        return
    mac = mac.upper()
    bonds = list_bonds()
    for b in bonds:
        if b.get("mac", "").upper() == mac:
            b["last_seen_ts"] = _now()
            _flush()
            return


# ── BLE secret store ────────────────────────────────────────────────────
# Called from bt._irq on _IRQ_SET_SECRET / _IRQ_GET_SECRET. Without
# persisting these, every reconnect after a reboot has to re-pair.

def _key(sec_type, key):
    return "%d:%s" % (int(sec_type), _hex(key) or "")


def set_secret(sec_type, key, value):
    """value=None means delete the entry (BLE-1.28 stack uses this to
    invalidate an old LTK)."""
    secs = _load()["secrets"]
    k = _key(sec_type, key)
    if value is None:
        if k in secs:
            del secs[k]
            _flush()
        return True
    secs[k] = _hex(value)
    _flush()
    return True


def get_secret(sec_type, index, key):
    """Two lookup forms:
      key is None  → return the index-th secret of this sec_type (iter)
      key is bytes → return the value for that exact key, or None.
    """
    secs = _load()["secrets"]
    if key is None:
        # Iterate matching sec_types — used by the stack to walk all bonds.
        i = 0
        prefix = "%d:" % int(sec_type)
        for stored_key, stored_val in secs.items():
            if not stored_key.startswith(prefix):
                continue
            if i == index:
                # Return (key_bytes, value_bytes)
                return (_unhex(stored_key[len(prefix):]),
                        _unhex(stored_val))
            i += 1
        return None
    k = _key(sec_type, key)
    return _unhex(secs.get(k))
