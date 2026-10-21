"""WiFi manager for the Oreo Badge.

Saved networks live in `/wifi.json` on flash — a user-editable list
maintained by the WiFi settings app:

    [
      {"ssid": "Home",   "password": "...", "priority": 1, "metered": false},
      {"ssid": "Hotspot","password": "...", "priority": 5, "metered": true}
    ]

Two sources can populate that list:
  • `secrets.WIFI_NETWORKS` (from `.env` via `tools/deploy.py`) — a
    list of {ssid, password, priority, metered} dicts. On every boot
    `connect_from_config()` merges this list into `/wifi.json`,
    refreshing passwords + priorities and adding any new entries
    without touching user-added networks. Edit `.env`, redeploy,
    new networks are live.
  • The on-device Settings → WiFi → Networks page — `add_saved()` /
    `remove_saved()` write the same json directly.

`.env` format is parallel CSV — first SSID matches first password:

    WIFI_SSID=home_net,elixpo_srv,office
    WIFI_PASSWORD=homepass,srvpass,officepass

`connect_from_config()` walks the merged list in ascending-priority
order (lower number = tried first) and stops on the first SSID that
associates.

Usage:
    from oreoWare import wifi
    wifi.connect_from_config()        # auto-pick best saved network
    wifi.is_connected()
    wifi.list_saved()                 # for the settings UI
    wifi.add_saved(ssid, pw, priority=10, metered=False)
    wifi.remove_saved(ssid)
    wifi.is_metered()                 # current link metered?
"""

import network
import time

try:
    import json as _json
except ImportError:
    _json = None

try:
    import os as _os
except ImportError:
    _os = None

_wlan = None

_SAVED_PATH       = "/wifi.json"
_PER_NET_TIMEOUT  = 10000   


def _get_wlan():
    global _wlan
    if _wlan is None:
        _wlan = network.WLAN(network.STA_IF)
    return _wlan


def _apply_power_cap(wlan):
    """Apply the secrets-baked TX-power dBm cap + power-save mode.

    Done as a best-effort: every `wlan.config(...)` call is wrapped in
    try/except so older / minimal MicroPython builds without one of these
    keys don't kill WiFi entirely.
    """
    try:
        from secrets import WIFI_TX_DBM
        try:
            wlan.config(txpower=int(WIFI_TX_DBM))
        except Exception:
            pass
    except Exception:
        pass
    try:
        from secrets import WIFI_POWERSAVE
        if WIFI_POWERSAVE:
            try:
                wlan.config(pm=wlan.PM_POWERSAVE)
            except Exception:
                pass
    except Exception:
        pass


MDNS_HOSTNAME = "oreo"


_hostname_applied        = False     # per-WLAN dhcp_hostname / hostname
_global_hostname_applied = False     # network.hostname() (mDNS)


def _apply_global_hostname():
    """Set the global network hostname BEFORE `wlan.active(True)`.

    This is the one that actually drives the ESP-IDF mDNS responder
    — once `network.hostname("oreo")` is set and the interface comes
    up, IDF auto-advertises `oreo.local` to the LAN. Setting it
    AFTER active(True) is a no-op on most builds because the mDNS
    service is already configured by then.

    The earlier worry that this call leaves the radio in a half-
    initialised state was misplaced — the actual culprit was IDF
    auto-connecting from cached NVS credentials, which we now
    cancel with wlan.disconnect() in connect(). Calling
    network.hostname() before any radio activity is safe.
    """
    global _global_hostname_applied
    if _global_hostname_applied:
        return
    try:
        import network as _net
        if hasattr(_net, "hostname"):
            _net.hostname(MDNS_HOSTNAME)
            _global_hostname_applied = True
    except Exception as e:
        # Older build without network.hostname() — fall through; the
        # per-WLAN dhcp_hostname applied later still gets us into the
        # router's DHCP-snooping resolver on most home gateways.
        try: print("[wifi] network.hostname() failed:", e)
        except Exception: pass


def _apply_hostname(wlan):
    """Per-WLAN hostname config (`dhcp_hostname` / `hostname`).
    Called AFTER active+disconnect so the radio is stable. The
    global mDNS broadcast was already configured by
    `_apply_global_hostname()` before active(True) — this is the
    secondary "tell the router via DHCP Option 12" path.
    """
    global _hostname_applied
    if _hostname_applied:
        return
    for key in ("dhcp_hostname", "hostname"):
        try:
            wlan.config(**{key: MDNS_HOSTNAME})
            _hostname_applied = True
        except Exception:
            pass


def radio_on():
    """Power up the radio without trying to associate. Lets the user
    flip WiFi 'on' from the Settings page even when no saved network
    is reachable — keeps the toggle from feeling broken when the
    badge is somewhere with no known WiFi nearby."""
    try:
        wlan = _get_wlan()
        wlan.active(True)
        return True
    except Exception:
        return False


def radio_off():
    """Power the radio fully down. Releases any active connection
    cleanly and saves the ~70 mA the WiFi MAC pulls in idle. Pairs
    with `radio_on()` so a UI toggle has a real on/off semantic."""
    try:
        wlan = _get_wlan()
        try: wlan.disconnect()
        except Exception: pass
        try: wlan.active(False)
        except Exception: pass
        return True
    except Exception:
        return False


def is_radio_on():
    """True iff the WiFi MAC is powered up. Distinct from
    `is_connected()`, which only flips true after a full association.
    UI 'WiFi: ON/OFF' should track this — association state is a
    sub-label on the same row."""
    try:
        return bool(_get_wlan().active())
    except Exception:
        return False


def connect(ssid, password, timeout_ms=6000, pump_cb=None):
    """Initiate a WiFi association and wait (up to `timeout_ms`) for it
    to complete.

    On ESP32-S3, IDF auto-starts a connect attempt with its own
    NVS-cached credentials the moment `wlan.active(True)` is called.
    If we don't cancel that first, every subsequent `wlan.config()`
    or `wlan.connect()` returns `Wifi Internal State Error` because
    IDF thinks "sta is already connecting". We unconditionally
    `wlan.disconnect()` + sleep briefly to flush that state before
    doing any config of our own.

    `pump_cb` is the escape-hatch from the "badge looks frozen during
    SEARCH" trap: the wait loop calls it ~12 times per second and
    bails immediately if it returns truthy.
    """
    wlan = _get_wlan()
    # Set the global hostname BEFORE bringing the radio up. The mDNS
    # responder in ESP-IDF reads it during interface init; setting
    # it later doesn't change the already-broadcast service record.
    # This is the single most important line for `oreo.local` to
    # actually resolve on the LAN.
    _apply_global_hostname()
    try:
        wlan.active(True)
    except Exception as e:
        print("[wifi] active(True) raised:", e)
        return False
    # Cancel any in-flight connect IDF kicked off on active(True). This
    # is the single most important line in this function on ESP32 —
    # without it the next wlan.config()/wlan.connect() returns "sta is
    # connecting, cannot set config" and the radio never associates to
    # the credentials we actually want.
    try:
        wlan.disconnect()
    except Exception:
        pass
    # Tiny settle window so the disconnect propagates inside the
    # IDF state machine before we issue the new connect. 50 ms is
    # enough on every build we've tested.
    time.sleep_ms(50)
    try:
        _apply_hostname(wlan)
    except Exception:
        pass
    try:
        _apply_power_cap(wlan)
    except Exception:
        pass
    try:
        if wlan.isconnected() and wlan.config("essid") == ssid:
            return True
    except Exception:
        pass
    try:
        wlan.connect(ssid, password)
    except Exception as e:
        print("[wifi] wlan.connect raised:", e)
        return False
    start = time.ticks_ms()
    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), start) > timeout_ms:
            return False
        # Pump first so the very-first frame of "searching..." can be
        # cancelled. Sleep duration is intentionally short (~80 ms) so
        # button-to-cancel feels instant, but long enough that we don't
        # eat all the CPU we're trying to keep available.
        if pump_cb:
            try:
                if pump_cb():
                    print("[wifi] connect cancelled by pump_cb")
                    return False
            except Exception:
                pass
        time.sleep_ms(80)
    try:
        _apply_power_cap(wlan)
    except Exception:
        pass
    return True


def _exists(path):
    if _os is None:
        return False
    try:
        _os.stat(path)
        return True
    except OSError:
        return False


def _load_saved_raw():
    """Read `/wifi.json` as a Python list. Returns [] on missing/bad
    file — the caller is expected to bootstrap from secrets if so."""
    if _json is None or not _exists(_SAVED_PATH):
        return []
    try:
        with open(_SAVED_PATH) as f:
            data = _json.loads(f.read())
        if not isinstance(data, list):
            return []
        return data
    except Exception:
        return []


def _save_raw(networks):
    if _json is None:
        return False
    try:
        with open(_SAVED_PATH, "w") as f:
            f.write(_json.dumps(networks))
        return True
    except Exception:
        return False


def _secrets_networks():
    """Read the canonical list of deploy-time networks from secrets.py.

    Modern secrets.py (generated by `tools/deploy.py`) ships
    WIFI_NETWORKS as a list of {ssid, password, priority, metered}
    dicts. Older builds only have the singular WIFI_SSID / WIFI_PASSWORD
    pair; we wrap that into a one-entry list so callers don't care.
    Returns [] when nothing is configured.
    """
    try:
        import secrets
    except Exception:
        return []
    nets = getattr(secrets, "WIFI_NETWORKS", None)
    if isinstance(nets, (list, tuple)) and nets:
        return [dict(n) for n in nets if isinstance(n, dict) and n.get("ssid")]
    # Legacy fallback: just the first pair.
    ssid = getattr(secrets, "WIFI_SSID", "")
    pw   = getattr(secrets, "WIFI_PASSWORD", "")
    if ssid:
        return [{"ssid": ssid, "password": pw, "priority": 1, "metered": False}]
    return []


def _sync_secrets_into_saved():
    """Merge the deploy-time WIFI_NETWORKS list into /wifi.json.

    Called once per boot from connect_from_config(). Semantics:
      • Every secrets network is ENSURED to be in /wifi.json. If
        present already (matched by SSID), its priority is refreshed
        and its password is refreshed ONLY when the new password is
        non-empty — that protects a previously-working credential
        from being clobbered if the user trims their .env (e.g.
        adds a new SSID slot but doesn't add the matching
        WIFI_PASSWORD entry).
      • Networks the user added on-device that are NOT in secrets
        are preserved as-is.
      • If /wifi.json doesn't exist yet, this acts as the initial
        bootstrap (replaces the old _bootstrap_from_secrets path).
    """
    secret_nets = _secrets_networks()
    if not secret_nets:
        return
    saved = _load_saved_raw() or []
    by_ssid = {n.get("ssid", ""): n for n in saved if n.get("ssid")}
    changed   = False
    added     = 0
    refreshed = 0
    for s in secret_nets:
        ssid = s.get("ssid", "")
        if not ssid:
            continue
        existing = by_ssid.get(ssid)
        if existing is None:
            saved.append({
                "ssid":     ssid,
                "password": s.get("password", ""),
                "priority": int(s.get("priority", 10)),
                "metered":  bool(s.get("metered", False)),
            })
            changed = True
            added  += 1
            continue
        # Existing entry — refresh priority unconditionally, password
        # only if the new value is non-empty.
        new_pri = int(s.get("priority", existing.get("priority", 10)))
        new_pw  = s.get("password", "") or ""
        local_changed = False
        if int(existing.get("priority", 99)) != new_pri:
            existing["priority"] = new_pri
            local_changed = True
        if new_pw and existing.get("password") != new_pw:
            existing["password"] = new_pw
            local_changed = True
        if local_changed:
            changed    = True
            refreshed += 1
    if changed:
        _save_raw(saved)
        print("[wifi] secrets sync: +%d new, %d refreshed (of %d)" %
              (added, refreshed, len(secret_nets)))


def _bootstrap_from_secrets():
    """Compat shim — older code paths call this. Delegates to the
    sync logic and then returns the freshly-loaded list."""
    _sync_secrets_into_saved()
    return _load_saved_raw()


def list_saved():
    """Return the saved-networks list, sorted by ascending priority.
    Caller gets fresh dicts — mutating them doesn't affect on-disk state
    until save_saved() is called."""
    nets = _load_saved_raw() or _bootstrap_from_secrets()
    # Defensive copy + priority sort (None or missing → very high so
    # nameless entries sink to the bottom).
    def _key(n):
        try:
            return int(n.get("priority", 999))
        except Exception:
            return 999
    return sorted([dict(n) for n in nets if n.get("ssid")], key=_key)


def save_saved(networks):
    """Replace the entire saved list. Settings UI uses this after
    add / remove / reorder."""
    return _save_raw(list(networks))


def add_saved(ssid, password, priority=10, metered=False):
    """Add or update a single saved network. Matched by SSID; existing
    entries are overwritten so the user doesn't accumulate duplicates
    if they re-enter the same network."""
    nets = _load_saved_raw() or _bootstrap_from_secrets()
    out  = [n for n in nets if n.get("ssid") != ssid]
    out.append({
        "ssid":     ssid,
        "password": password or "",
        "priority": int(priority),
        "metered":  bool(metered),
    })
    return _save_raw(out)


def remove_saved(ssid):
    nets = _load_saved_raw()
    out  = [n for n in nets if n.get("ssid") != ssid]
    if len(out) == len(nets):
        return False
    return _save_raw(out)


def set_priority(ssid, priority):
    nets = _load_saved_raw()
    changed = False
    for n in nets:
        if n.get("ssid") == ssid:
            n["priority"] = int(priority)
            changed = True
            break
    if not changed:
        return False
    return _save_raw(nets)


def is_metered():
    """True iff the currently-associated SSID is flagged metered in
    /wifi.json. Used by OTA + Store to back off on tethered/hotspot
    connections so we don't burn the user's data plan."""
    cur = ssid()
    if not cur:
        return False
    for n in _load_saved_raw():
        if n.get("ssid") == cur:
            return bool(n.get("metered"))
    return False


def connect_from_config(pump_cb=None):
    """Try each saved network in priority order until one associates.

    Order of operations:
      0. Merge the .env-defined WIFI_NETWORKS list into /wifi.json
         (ensures every secret network is present + has current
         creds, without clobbering user-added entries).
      1. /wifi.json — the user-managed list, edited via Settings → WiFi.
      2. secrets.py legacy single-pair bootstrap if step 0 produced
         nothing somehow.
      3. Otherwise: return False, radio stays off.

    Per-network timeout is short (_PER_NET_TIMEOUT) so a stale entry
    doesn't stall the boot.
    """
    # Pull deploy-time networks into the on-flash list. Cheap on
    # subsequent calls — only re-writes /wifi.json if something
    # actually changed since the last sync.
    try:
        _sync_secrets_into_saved()
    except Exception as e:
        print("[wifi] secrets sync failed:", e)
    nets = list_saved()
    if not nets:
        # Last-ditch: try the deploy-time secret directly. Without this
        # an empty /wifi.json silently disabled WiFi forever on freshly
        # flashed badges — the toggle on the Status row would call
        # connect_from_config(), find no saved nets, and bail without
        # ever bringing the radio up.
        try:
            import secrets
            ssid_ = getattr(secrets, "WIFI_SSID", "")
            pw    = getattr(secrets, "WIFI_PASSWORD", "")
            if ssid_:
                print("[wifi] no saved nets, falling back to secrets bootstrap")
                # Persist as the new "priority 1" entry so this branch
                # only fires once per device — subsequent connects use
                # the normal path.
                try:
                    add_saved(ssid_, pw, priority=1, metered=False)
                except Exception:
                    pass
                ok = False
                try:
                    ok = connect(ssid_, pw,
                                 timeout_ms=_PER_NET_TIMEOUT,
                                 pump_cb=pump_cb)
                except Exception:
                    pass
                return ok
        except Exception as e:
            print("[wifi] secrets bootstrap failed:", e)
        print("[wifi] no networks configured")
        return False
    for n in nets:
        ssid_ = n.get("ssid") or ""
        if not ssid_:
            continue
        pw = n.get("password") or ""
        try:
            print("[wifi] try %s (p=%s)" %
                  (ssid_, n.get("priority", "?")))
            ok = connect(ssid_, pw,
                         timeout_ms=_PER_NET_TIMEOUT,
                         pump_cb=pump_cb)
        except Exception as e:
            print("[wifi] connect raised:", e)
            ok = False
        if ok:
            print("[wifi] associated:", ssid_)
            return True
        # If the user cancelled mid-search, stop trying further
        # networks — they explicitly asked us to give up. Without
        # this we'd plough through every saved entry honouring their
        # individual timeouts.
        if pump_cb is not None:
            try:
                if pump_cb():
                    print("[wifi] connect_from_config cancelled")
                    return False
            except Exception:
                pass
    print("[wifi] all %d saved networks failed" % len(nets))
    return False


def disconnect():
    wlan = _get_wlan()
    wlan.disconnect()
    wlan.active(False)


def is_connected():
    try:
        return _get_wlan().isconnected()
    except Exception:
        return False


def ip():
    try:
        wlan = _get_wlan()
        if wlan.isconnected():
            return wlan.ifconfig()[0]
    except Exception:
        pass
    return None


def rssi():
    try:
        return _get_wlan().status("rssi")
    except Exception:
        return None


def ssid():
    """Currently-associated SSID, or None if not connected."""
    try:
        wlan = _get_wlan()
        if wlan.isconnected():
            return wlan.config("essid")
    except Exception:
        pass
    return None


def ping(host="8.8.8.8", port=53, timeout_s=2):
    """TCP-connect "ping" to a known endpoint. MicroPython doesn't ship
    raw ICMP sockets on this port, so we time the TCP handshake to a
    cheap target (Google's DNS on port 53 by default).

    Returns (ok, rtt_ms). `ok=False, rtt_ms=None` on failure.
    """
    try:
        import socket as _s
    except ImportError:
        return (False, None)
    if not is_connected():
        return (False, None)
    try:
        addr = _s.getaddrinfo(host, port)[0][-1]
    except Exception:
        return (False, None)
    sock = _s.socket()
    try:
        sock.settimeout(timeout_s)
    except Exception:
        pass
    t0 = time.ticks_ms()
    try:
        sock.connect(addr)
        rtt = time.ticks_diff(time.ticks_ms(), t0)
        return (True, rtt)
    except Exception:
        return (False, None)
    finally:
        try:
            sock.close()
        except Exception:
            pass


def speed_test(bytes_=200_000, timeout_s=10, pump_cb=None):
    """Throughput probe: download `bytes_` from speed.cloudflare.com
    and report observed kbps.

    `pump_cb` is called between every recv() so the caller can keep
    the OS run loop alive — typically passes a closure that re-reads
    the button matrix and bumps the screen. The socket is set to a
    50-ms recv timeout so each blocked read can't freeze the UI for
    more than that. If pump_cb returns True the test aborts cleanly
    (used by the WiFi app's "cancel by any keypress" UX).

    Default size dropped from 500 KB → 200 KB. The handshake is
    still amortised but the test finishes in ~1–2 s on home WiFi
    and ~5 s on weak links, both well within user attention span.

    Returns (ok, kbps, elapsed_ms). On failure or cancel,
    (False, 0, elapsed).
    """
    try:
        import socket as _s
        import ssl    as _ssl
    except ImportError:
        return (False, 0, 0)
    if not is_connected():
        return (False, 0, 0)
    host = "speed.cloudflare.com"
    path = "/__down?bytes=%d" % int(bytes_)
    try:
        addr = _s.getaddrinfo(host, 443)[0][-1]
    except Exception:
        return (False, 0, 0)

    raw = None
    s   = None
    deadline = time.ticks_add(time.ticks_ms(), int(timeout_s * 1000))
    t0 = time.ticks_ms()
    received = 0
    body_started = False
    cancelled = False

    # 50 ms recv timeout caps each blocking read so the run loop
    # can resume between reads. This is the difference between
    # "buttons frozen for 5 s" and "buttons responsive throughout".
    PER_READ_S = 0.05

    def _pump():
        """Run the caller's pump callback if any; flag cancel."""
        nonlocal cancelled
        if pump_cb is None:
            return
        try:
            if pump_cb():
                cancelled = True
        except Exception:
            pass

    try:
        raw = _s.socket()
        try: raw.settimeout(timeout_s)   # connect can take a while
        except Exception: pass
        raw.connect(addr)
        s = _ssl.wrap_socket(raw, server_hostname=host)
        try: s.settimeout(PER_READ_S)
        except Exception: pass
        req = ("GET %s HTTP/1.1\r\nHost: %s\r\n"
               "User-Agent: OreoBadge-Speed\r\n"
               "Accept-Encoding: identity\r\n"
               "Connection: close\r\n\r\n") % (path, host)
        s.write(req.encode())
        head = b""
        # Read headers. With the short PER_READ_S timeout each recv
        # bails fast on no-data; we loop until the separator arrives
        # or the overall deadline blows.
        while b"\r\n\r\n" not in head:
            if cancelled:
                break
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
            try:
                chunk = s.read(2048)
            except OSError:
                _pump()
                continue
            except Exception:
                break
            if not chunk:
                break
            head += chunk
            if len(head) > 16 * 1024:
                break
            _pump()
        sep = head.find(b"\r\n\r\n")
        if sep >= 0:
            body_started = True
            received = len(head) - (sep + 4)
        # Drain the body.
        while body_started:
            if cancelled:
                break
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
            try:
                chunk = s.read(4096)
            except OSError:
                _pump()
                continue
            except Exception:
                break
            if not chunk:
                break
            received += len(chunk)
            _pump()
            if received >= bytes_:
                break
    except Exception:
        pass
    finally:
        for h in (s, raw):
            try:
                if h is not None:
                    h.close()
            except Exception:
                pass
    elapsed = max(1, time.ticks_diff(time.ticks_ms(), t0))
    if cancelled:
        return (False, 0, elapsed)
    if received <= 0:
        return (False, 0, elapsed)
    kbps = int((received * 8) // elapsed)   # bytes*8 / ms = kbps
    return (True, kbps, elapsed)


def info():
    """One-shot snapshot for the WiFi detail screen.

    Returns a dict with `connected`, `ssid`, `ip`, `subnet`, `gateway`,
    `dns`, and `rssi`. Missing fields are None — the UI fills with '—'.
    """
    out = {"connected": False, "radio_on": False,
           "ssid": None,    "ip": None,
           "subnet":   None,  "gateway": None, "dns": None,
           "rssi":     None}
    try:
        wlan = _get_wlan()
        try:
            out["radio_on"] = bool(wlan.active())
        except Exception:
            pass
        out["connected"] = bool(wlan.isconnected())
        if out["connected"]:
            cfg = wlan.ifconfig()    # (ip, subnet, gateway, dns)
            out["ip"]      = cfg[0]
            out["subnet"]  = cfg[1]
            out["gateway"] = cfg[2]
            out["dns"]     = cfg[3]
            try:
                out["ssid"] = wlan.config("essid")
            except Exception:
                pass
            try:
                out["rssi"] = wlan.status("rssi")
            except Exception:
                pass
    except Exception:
        pass
    return out


# ── power-mode preset cycling ────────────────────────────────────────────
# A single dial that covers TX dBm + power-save mode together so the user
# doesn't reason about both. Persisted on the OS settings dict so the
# choice survives a reboot.

POWER_MODES = ("off", "eco", "balanced", "max")

_MODE_TX_DBM = {"eco": 5, "balanced": 11, "max": 19}


def set_power_mode(mode):
    """Apply a coherent (tx_dbm, pm) preset to the live radio.

    'off'      → radio down
    'eco'      → 5 dBm, PM_POWERSAVE
    'balanced' → 11 dBm, PM_POWERSAVE (matches existing default)
    'max'      → 19 dBm, PM_NONE
    """
    if mode not in POWER_MODES:
        return False
    wlan = _get_wlan()
    if mode == "off":
        try:
            wlan.disconnect()
        except Exception:
            pass
        try:
            wlan.active(False)
        except Exception:
            pass
        return True

    try:
        wlan.active(True)
    except Exception:
        return False
    try:
        wlan.config(txpower=_MODE_TX_DBM[mode])
    except Exception:
        pass
    try:
        wlan.config(pm=(wlan.PM_NONE if mode == "max" else wlan.PM_POWERSAVE))
    except Exception:
        pass
    return True


def get_power_mode():
    """Best-effort introspection — returns the current preset name based
    on the active TX-power level and PM mode. Falls back to 'balanced'
    when MicroPython doesn't expose enough config to be sure."""
    try:
        wlan = _get_wlan()
        if not wlan.active():
            return "off"
        try:
            tx = int(wlan.config("txpower"))
        except Exception:
            return "balanced"
        if tx <= 6:
            return "eco"
        if tx >= 17:
            return "max"
        return "balanced"
    except Exception:
        return "balanced"
