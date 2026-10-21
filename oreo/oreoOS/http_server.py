"""Tiny HTTP server for AirDrop-style file transfer over WiFi.

The badge advertises itself over BLE (so the phone sees it in Nearby /
the Oreo Pair flow), but the actual file bytes flow over WiFi because
the BLE GATT path is too slow and there's no Classic-BT OBEX on this
firmware. When WiFi is up, this module:

  GET  /          serves a one-page upload form (HTML in-line below)
  POST /upload    parses one multipart file part, writes it to flash,
                  routes by extension:
                       browser-made .r565/.rv565 -> Gallery optimized assets
                       .md                   -> documents/
                       .txt                  -> documents/
                       (anything else)        -> rejected with 415
  GET  /favicon.ico  204 (silences browser noise)

Design notes
------------
* Single-threaded, non-blocking. `tick()` is called from the OS run
  loop; we only ever process one HTTP request per tick. A long upload
  freezes the UI for the duration — acceptable for v1 because the
  phone-side share takes a couple of seconds for typical photos.
* Multipart parsing is streamed: we never hold the full payload in
  RAM. Chunks land directly into the on-disk file as they arrive,
  with a sliding-window check for the closing boundary marker.
* No HTTPS. The transfer happens on the local LAN; adding TLS would
  pull in ~30 KB of code and zero security benefit for a peer who
  could already sniff the broadcast.

Public surface:
    http_server.start(os_obj)   open listening socket on WiFi IP
    http_server.tick()          accept + handle a pending request
    http_server.stop()          close listening socket
    http_server.url()           "http://192.168.x.y/" — show on screen
"""

import gc

try:
    import socket as _socket
except ImportError:
    _socket = None

try:
    import os as _os
except ImportError:
    _os = None


PORT          = 80
MAX_BODY      = 8 * 1024 * 1024   # videos stream to flash; never buffered in RAM
READ_CHUNK    = 2048
RECV_TIMEOUT       = 3            # seconds — per-recv() during streaming
HEADER_RECV_TIMEOUT = 0.05        # never stall the badge input loop on an
                                  # accepted browser socket with no data yet
HEAD_DEADLINE_MS   = 300          # hard cap on header-read for tiny requests
                                  # (beacons / session/new). Anything slower
                                  # than this is almost certainly a TLS probe
                                  # or a stuck client and would otherwise
                                  # freeze the run loop one beacon at a time.

# Session lifecycle
SESSION_TTL_MS         = 60 * 1000   # beacon must refresh within this
SESSION_HARD_TTL_MS    = 60 * 60 * 1000  # 60 min absolute cap from authed_at,
                                         # even if the client keeps beaconing.
                                         # Stops stale tabs left open from
                                         # holding a slot forever.
SESSION_MAX            = 8           # never track more than this many concurrent
SESSION_CHARSET        = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/l

# Badge code — a 6-char alphanumeric value displayed on the badge's
# Send Files page that senders must type into the upload page to
# authenticate. Rotates every BADGE_CODE_TTL_MS (5 min) so a leaked
# code self-expires, and the badge owner can also force a rotation
# via `refresh_code()` from the UI.
BADGE_CODE_TTL_MS      = 5 * 60 * 1000

_lsock     = None
_bound_ip  = None
_os_obj    = None     # captured from start(os_obj) so we can persist
                      # `transfer_enabled` across reboots via settings_set

# Badge code state — rotated on demand or by TTL. We refresh lazily
# (whenever someone asks for the current code or hits an endpoint) so
# the rotation doesn't need its own background tick.
_badge_code      = ""
_badge_code_ts   = 0       # ticks_ms when current code was minted

# Master kill switch — when False, every HTTP endpoint returns 503
# with a "transfer disabled" page. Persisted to OS settings so a
# user-flipped-off state survives reboot. Default ON; the badge
# owner toggles via long-press LEFT on the Send Files page.
_transfer_enabled = True

# Session state machine, code-gated:
#
#   _sessions[device_id] = {
#       "state":     "authed" | "approving" | "approved" | "denied",
#       "last_ms":   ticks_ms of last beacon hit,
#       "addr":      requesting peer ip (for display),
#       "uploads":   completed upload count for this session,
#       "authed_at": ticks_ms when /auth was accepted,
#   }
#
# Senders that haven't yet hit /auth with the correct code never
# enter this dict — they're invisible to the badge. After auth,
# they're "authed" (yellow on the badge). After the badge owner
# taps A on their row, "approved" (green). After they finish or get
# denied, they're pruned.
_sessions = {}

# Live upload progress so the WiFi app can render a real-time bar while
# bytes are flowing in. None when no upload is in flight.
_progress = None

# Bumped to ticks_ms() each time an upload completes successfully.
# The WiFi/Transfer UI polls this to drive the bottom "Received" toast
# without needing a callback hook into the app layer.
_last_upload_ts   = 0
_last_upload_name = ""


def last_upload():
    """Return (ticks_ms_at_completion, filename) of the most recent
    completed upload, or (0, '') if nothing has landed yet. UI calls
    this every tick to decide whether to show the 'Received' toast."""
    return _last_upload_ts, _last_upload_name


def free_bytes():
    """Best-effort free bytes on the badge's filesystem. Used by the
    upload page's pre-flight check so the browser can reject an
    oversized file before any bytes leave the phone. Returns 0 on
    error so the client treats the badge as full and prompts the
    user to free space."""
    if _os is None:
        return 0
    try:
        # MicroPython: statvfs returns (bsize, frsize, blocks, bfree,
        # bavail, files, ffree, favail, flag, namemax). Use bfree (free
        # blocks for unprivileged users) * fragment size.
        s = _os.statvfs("/")
        return int(s[0]) * int(s[3])
    except Exception:
        return 0



# ── routing tables ──────────────────────────────────────────────────────

_GALLERY_DIR  = "apps/gallery/assets/optimized"   # was /raw — Gallery
                                                  # only reads optimized/
                                                  # at runtime, so raw
                                                  # uploads were invisible
                                                  # until a laptop deploy
                                                  # re-ran the optimiser.
                                                  # We now upload pre-
                                                  # converted .r565 binaries
                                                  # straight into here.
_DOCS_DIR     = "documents"

# .r565 is our on-device-renderable image format: 6-byte header
# (magic 'R5' + width LE16 + height LE16), then W*H 2-byte RGB565
# pixels. The browser does the conversion before upload — see the
# canvas pipeline in _UPLOAD_FORM below.
_IMG_EXTS = (".r565", ".rz565")
_VIDEO_EXTS = (".rv565",)
_DOC_EXTS = (".md", ".txt", ".mdz", ".txtz")


def _ensure_dir(path):
    """mkdir -p — tolerates intermediate dirs already existing."""
    if _os is None:
        return
    parts = path.split("/")
    cur = ""
    for p in parts:
        if not p:
            continue
        cur = (cur + "/" + p) if cur else p
        try:
            _os.mkdir(cur)
        except OSError:
            pass


def _route_for(filename):
    """Pick the on-disk directory + accept policy for an upload. Returns
    (dest_dir, kind_label) on accept, or (None, reason_string) on reject."""
    if not filename:
        return None, "no filename"
    fl = filename.lower()
    for ext in _IMG_EXTS:
        if fl.endswith(ext):
            return _GALLERY_DIR, "image"
    for ext in _VIDEO_EXTS:
        if fl.endswith(ext):
            return _GALLERY_DIR, "video"
    for ext in _DOC_EXTS:
        if fl.endswith(ext):
            return _DOCS_DIR, "document"
    return None, "unsupported type"


def _safe_filename(raw):
    """Strip path separators + non-printable chars. Phones occasionally
    POST filenames with directory parts; we ignore them so an upload
    can never escape the target dir."""
    if not raw:
        return ""
    name = raw.replace("\\", "/").rsplit("/", 1)[-1]
    out  = []
    for ch in name:
        c = ord(ch)
        # printable ASCII except path separators (already handled) and
        # null. Anything weirder gets dropped so the FS doesn't choke.
        if 32 <= c < 127 and ch not in "/\\?*:|\"<>":
            out.append(ch)
    return "".join(out)[:64] or "upload"


def _validate_uploaded_asset(path, kind):
    """Reject truncated/wrong-format files before the atomic commit."""
    try:
        size = _os.stat(path)[6]
        with open(path, "rb") as f:
            head = f.read(12)
            if kind == "image":
                if head[:4] == b"R5Z\x01" and len(head) == 12:
                    w = head[4] | (head[5] << 8)
                    h = head[6] | (head[7] << 8)
                    raw = (head[8] | (head[9] << 8) |
                           (head[10] << 16) | (head[11] << 24))
                    return 0 < w <= 320 and 0 < h <= 240 and raw == w * h * 2
                if head[:2] == b"R5" and len(head) >= 6:
                    w = head[2] | (head[3] << 8)
                    h = head[4] | (head[5] << 8)
                    return 0 < w <= 320 and 0 < h <= 240 and size == 6 + w * h * 2
                return False
            if kind == "document":
                if path.lower().endswith((".mdz", ".txtz")):
                    return len(head) >= 8 and head[:4] == b"ODZ\x01"
                return path.lower().endswith((".md", ".txt"))
            if len(head) != 12 or head[:3] != b"RV5" or head[3] not in (1, 2, 3, 4, 5, 6):
                return False
            w = head[4] | (head[5] << 8)
            h = head[6] | (head[7] << 8)
            fps = head[8]
            frames = head[10] | (head[11] << 8)
            if not (0 < w <= 320 and 0 < h <= 240 and 0 < fps <= 30 and frames > 0):
                return False
            if head[3] == 5:
                return size == 12 + w * h * 2 * frames
            if head[3] == 6:
                cursor = 12
                for _ in range(frames):
                    f.seek(cursor)
                    nbuf = f.read(4)
                    if len(nbuf) != 4:
                        return False
                    packed = (nbuf[0] | (nbuf[1] << 8) |
                              (nbuf[2] << 16) | (nbuf[3] << 24))
                    if packed <= 0:
                        return False
                    cursor += 4 + packed
                    if cursor > size:
                        return False
                return cursor == size
            return True
    except Exception:
        return False


# ── server lifecycle ────────────────────────────────────────────────────

def start(os_obj=None):
    """Open the listening socket. Also captures `os_obj` for the
    transfer-enabled toggle (we persist that to OS settings)."""
    global _os_obj
    if os_obj is not None:
        _os_obj = os_obj
        # Hydrate the kill switch from settings on first start. Default
        # True so a fresh badge has transfer working out of the box.
        try:
            global _transfer_enabled
            _transfer_enabled = bool(
                os_obj.settings_get("transfer_enabled", True))
        except Exception:
            pass
    return _start_listener()


def _start_listener():
    """Open the listening socket on the current WiFi IP. Safe to call
    multiple times — re-binds if WiFi reconnected to a different IP."""
    global _lsock, _bound_ip
    if _socket is None:
        return False
    # Resolve current WiFi IP via the wifi module.
    try:
        from oreoWare import wifi
        ip = wifi.ip()
    except Exception:
        ip = None
    if not ip:
        return False
    # If we're already bound on this IP, nothing to do.
    if _lsock is not None and _bound_ip == ip:
        return True
    stop()
    try:
        s = _socket.socket()
        # SO_REUSEADDR so a fast WiFi flap doesn't leave us in TIME_WAIT
        # waiting to bind. MicroPython doesn't always expose SOL_SOCKET
        # constants, so wrap the setsockopt in its own try.
        try:
            s.setsockopt(_socket.SOL_SOCKET, _socket.SO_REUSEADDR, 1)
        except Exception:
            pass
        addr = _socket.getaddrinfo(ip, PORT)[0][-1]
        s.bind(addr)
        s.listen(2)
        s.setblocking(False)
        _lsock = s
        _bound_ip = ip
        try:
            print("[http] listening on %s:%d" % (ip, PORT))
        except Exception:
            pass
        return True
    except Exception as e:
        try:
            print("[http] bind failed: %s" % e)
        except Exception:
            pass
        _lsock = None
        _bound_ip = None
        return False


def stop():
    global _lsock, _bound_ip
    if _lsock is not None:
        try:
            _lsock.close()
        except Exception:
            pass
    _lsock = None
    _bound_ip = None


def url():
    """The address users should type on their phone. Prefers the
    mDNS hostname (oreo.local) over the raw IP because it survives
    DHCP-lease rotation and reads better off a tiny screen."""
    if _bound_ip is None:
        return ""
    return "http://oreo.local/"


def url_fallback():
    """Raw-IP version, shown beneath the mDNS URL for users on networks
    where multicast DNS doesn't work (some corporate WiFi)."""
    if _bound_ip is None:
        return ""
    return "http://%s/" % _bound_ip


def is_running():
    return _lsock is not None


# ── session state queries (UI hooks) ────────────────────────────────────

def _prune_sessions():
    """Drop sessions that haven't beaconed in SESSION_TTL_MS. Called
    cheaply on every query so the UI never shows ghosts."""
    try:
        import time as _t
        now = _t.ticks_ms()
    except Exception:
        return
    stale = []
    for sid, s in _sessions.items():
        last = s.get("last_ms", 0)
        authed_at = s.get("authed_at", 0)
        try:
            # Beacon idle (no heartbeat within SESSION_TTL_MS) — the
            # usual reason sessions go away.
            if _t.ticks_diff(now, last) > SESSION_TTL_MS:
                stale.append(sid)
                continue
            # Hard cap: even if the client is faithfully beaconing, a
            # session older than SESSION_HARD_TTL_MS (60 min) gets
            # evicted. Forces a re-handshake so a forgotten tab
            # can't camp on a device slot indefinitely.
            if _t.ticks_diff(now, authed_at) > SESSION_HARD_TTL_MS:
                stale.append(sid)
        except Exception:
            pass
    for sid in stale:
        _sessions.pop(sid, None)


def list_sessions():
    """Snapshot for the WiFi/Transfer UI. Returns sessions sorted by
    last-seen so the newest beacons are on top.

    `authed`, transient `approving`, and `approved` sessions are returned;
    denied ones
    are filtered out because the badge owner already made that call,
    and seeing them again would just be noise. Senders that haven't
    typed the correct code never enter _sessions in the first place,
    so they're naturally invisible here.
    """
    _prune_sessions()
    items = []
    for sid, s in _sessions.items():
        state = s.get("state", "authed")
        if state == "denied":
            continue
        items.append({
            "id":         sid,
            "device_id":  sid,                       # alias for the UI
            "state":      state,
            "addr":       s.get("addr", ""),
            "uploads":    s.get("uploads", 0),
            "last_ms":    s.get("last_ms", 0),
            "authed_at":  s.get("authed_at", 0),
        })
    # Sort by authed_at (stable insertion order) — NOT last_ms.
    # last_ms ticks every ~2 s as each client beacons, which made the
    # rows shuffle visibly every refresh and broke cursor stability
    # (the row under the user's cursor would slide away mid-tap).
    # authed_at is fixed for the lifetime of the session, so the
    # newest-first ordering stays stable until a session expires.
    items.sort(key=lambda v: v.get("authed_at", 0), reverse=True)
    return items


def approve(sid):
    """User tapped Allow on the WiFi/Transfer page."""
    if sid in _sessions:
        # `approving` gives the badge immediate, one-press feedback. The next
        # browser heartbeat promotes it to `approved`, proving that the sender
        # has observed the decision and making the transition visible.
        if _sessions[sid].get("state") == "authed":
            _sessions[sid]["state"] = "approving"
        return True
    return False


def deny(sid):
    if sid in _sessions:
        _sessions[sid]["state"] = "denied"
        return True
    return False


def progress():
    """Live upload progress dict, or None if no transfer is in flight."""
    return _progress


# ── badge-code rotation ─────────────────────────────────────────────────
#
# `current_code()` is the single source of truth. It rotates the cached
# code if the TTL has elapsed; callers (WiFi UI, /auth endpoint) just
# call it and get the live value. `refresh_code()` forces a rotation
# now — wired to the "R = refresh code" button on the Send Files page.

def _gen_code(n=6):
    """Six-char alphanumeric code excluding ambiguous shapes."""
    try:
        import time as _t
        seed = _t.ticks_ms() ^ id(_sessions)
    except Exception:
        seed = 1
    out = []
    cs = SESSION_CHARSET
    for _ in range(n):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(cs[seed % len(cs)])
    return "".join(out)


def current_code():
    """Return the live 6-char badge code, rotating if the TTL has
    elapsed since the last mint. UI calls this on every paint."""
    global _badge_code, _badge_code_ts
    try:
        import time as _t
        now = _t.ticks_ms()
    except Exception:
        now = 0
    if not _badge_code:
        _badge_code = _gen_code()
        _badge_code_ts = now
        return _badge_code
    try:
        if _t.ticks_diff(now, _badge_code_ts) > BADGE_CODE_TTL_MS:
            _badge_code = _gen_code()
            _badge_code_ts = now
    except Exception:
        pass
    return _badge_code


def refresh_code():
    """Force-mint a new code now. UI calls this when the user taps
    R = refresh code on the Send Files page."""
    global _badge_code, _badge_code_ts
    _badge_code = _gen_code()
    try:
        import time as _t
        _badge_code_ts = _t.ticks_ms()
    except Exception:
        _badge_code_ts = 0
    # Existing authed sessions stay valid — they authed under the OLD
    # code but their own TTL governs how long they last. Mid-transfer
    # senders aren't kicked by a rotation. Once their TTL expires
    # they'll need to re-auth with the new code.
    return _badge_code


def code_hash():
    """Return the 8-hex-char prefill hash of the current badge code.

    SHA-256 of the live code, truncated to its first 4 bytes (8 hex
    chars). The website hashes the user-typed code with the same
    function and passes it in `?prefill=<HASH>` when handing off to
    the badge — so the cleartext code never travels in the URL
    (which would otherwise appear in browser history). Matches are
    case-insensitive hex.
    """
    try:
        import uhashlib, binascii
        h = uhashlib.sha256(current_code().encode()).digest()
        return binascii.hexlify(h[:4]).decode()
    except Exception:
        # Best-effort fallback if uhashlib is unavailable: a much
        # weaker mixing function. Same length, same charset so URL
        # validation still works; the security argument is moot
        # since anyone on the LAN can read the code off the badge
        # anyway.
        s = current_code()
        x = 0
        for ch in s:
            x = ((x << 5) - x + ord(ch)) & 0xFFFFFFFF
        return "%08x" % x


def code_remaining_ms():
    """Milliseconds until the current code rotates. Used by the UI
    for the live countdown — returns 0 if already expired (next paint
    will mint a fresh one)."""
    if not _badge_code:
        return 0
    try:
        import time as _t
        elapsed = _t.ticks_diff(_t.ticks_ms(), _badge_code_ts)
        return max(0, BADGE_CODE_TTL_MS - elapsed)
    except Exception:
        return BADGE_CODE_TTL_MS


# ── master transfer-enabled toggle ──────────────────────────────────────

def is_transfer_enabled():
    return bool(_transfer_enabled)


def set_transfer_enabled(on):
    """Master kill switch. Persisted to OS settings so a user-toggled
    state survives reboot. UI calls this from the long-press LEFT
    binding on the Send Files page."""
    global _transfer_enabled
    _transfer_enabled = bool(on)
    if _os_obj is not None:
        try:
            _os_obj.settings_set("transfer_enabled", _transfer_enabled)
        except Exception:
            pass
    # When the owner kills transfer, clear out any pending sessions —
    # they can't do anything anyway and shouldn't linger after a
    # turn-back-on.
    if not _transfer_enabled:
        _sessions.clear()
    return _transfer_enabled




def _new_session_id():
    """Generate a 6-char alphanumeric id excluding ambiguous chars
    (0/O, 1/I, l). os.urandom would be ideal but isn't always present
    on MicroPython; time-mixed prand works for our scale."""
    import time as _t
    try:
        import os as _o
        seed = int.from_bytes(_o.urandom(4), "big")
    except Exception:
        seed = _t.ticks_ms() ^ id(_sessions)
    out = []
    n = len(SESSION_CHARSET)
    for _ in range(6):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(SESSION_CHARSET[seed % n])
    return "".join(out)


def tick():
    """Accept and handle one pending request, if any. Cheap when idle
    (one non-blocking accept() syscall that ENOENTs out)."""
    if _lsock is None:
        return
    try:
        cli, _addr = _lsock.accept()
    except OSError:
        # EAGAIN — no pending connection. The common path.
        return
    except Exception:
        return
    try:
        # Header reads share the main UI loop. A browser can open a TCP socket
        # speculatively and send nothing; using the 3-second upload timeout here
        # used to swallow several button scans per socket. Actual body handling
        # restores RECV_TIMEOUT after the request header has arrived.
        cli.settimeout(HEADER_RECV_TIMEOUT)
    except Exception:
        pass
    try:
        _handle(cli)
    except Exception as e:
        try:
            print("[http] handler crashed: %s" % e)
        except Exception:
            pass
    finally:
        try:
            cli.close()
        except Exception:
            pass
    gc.collect()


# ── request handling ────────────────────────────────────────────────────

def _read_until(sock, sep, max_len, deadline_ms=None):
    """Buffered recv that returns once `sep` appears in the stream.
    Returns (head_bytes, tail_bytes_after_sep) or (None, None) on
    timeout / overflow.

    `deadline_ms` is a hard wallclock cap measured from now. We need
    this so a TLS probe (browser ever-helpfully tries https first)
    can't pin the run loop for the full RECV_TIMEOUT × N recvs while
    the badge stops accepting button input.
    """
    try:
        import time as _t
        if deadline_ms is not None:
            deadline = _t.ticks_add(_t.ticks_ms(), int(deadline_ms))
        else:
            deadline = None
    except Exception:
        deadline = None
    buf = bytearray()
    while True:
        if len(buf) > max_len:
            return None, None
        if deadline is not None:
            try:
                if _t.ticks_diff(deadline, _t.ticks_ms()) <= 0:
                    return None, None
            except Exception:
                pass
        try:
            chunk = sock.recv(READ_CHUNK)
        except OSError:
            return None, None
        if not chunk:
            return None, None
        # Cheap TLS-handshake reject: a ClientHello starts with the
        # record-type byte 0x16. If the very first byte we ever see
        # is that, the browser was talking HTTPS — bail immediately
        # so we don't burn RECV_TIMEOUT waiting for header bytes
        # that will never come.
        if len(buf) == 0 and chunk and chunk[0] == 0x16:
            return None, None
        buf.extend(chunk)
        idx = buf.find(sep)
        if idx >= 0:
            head = bytes(buf[:idx])
            tail = bytes(buf[idx + len(sep):])
            return head, tail


def _parse_headers(head):
    """Returns (method, path, {header: value}). Headers are lowercased."""
    try:
        text = head.decode("utf-8", "ignore")
    except Exception:
        text = ""
    lines = text.split("\r\n")
    if not lines:
        return "", "", {}
    parts = lines[0].split(" ")
    method = parts[0] if len(parts) > 0 else ""
    path   = parts[1] if len(parts) > 1 else "/"
    headers = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        headers[k.strip().lower()] = v.strip()
    return method, path, headers


def _send_bytes(sock, data):
    """Send the whole buffer; socket.send() may accept only a prefix."""
    view = memoryview(data)
    sent = 0
    while sent < len(view):
        n = sock.send(view[sent:])
        if not n:
            raise OSError("socket closed while sending")
        sent += n


def _send_status(sock, code, reason, body=b"", content_type="text/html; charset=utf-8"):
    head = ("HTTP/1.1 %d %s\r\n"
            "Content-Type: %s\r\n"
            "Content-Length: %d\r\n"
            "Connection: close\r\n\r\n") % (code, reason, content_type, len(body))
    try:
        _send_bytes(sock, head.encode())
        if body:
            _send_bytes(sock, body)
    except Exception:
        pass


_UPLOAD_FORM = (
    b"<!doctype html><html lang='en'><head>"
    b"<meta name='viewport' content='width=device-width,initial-scale=1'>"
    b"<meta name='theme-color' content='#0F0C1C'>"
    b"<title>Send to Oreo</title>"
    b"<style>"
    b":root{--bg:#0F0C1C;--card:#1C1A2E;--cardb:#26213E;--bord:#2A2640;"
    b"--ink:#F5E6DC;--dim:#C8B8B0;--mute:#8A8294;--pri:#FF5D68;"
    b"--gold:#FFD166;--teal:#3DDC97;--lilac:#A29BFE}"
    b"*{box-sizing:border-box}"
    b"html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);"
    b"font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;"
    b"-webkit-font-smoothing:antialiased;min-height:100vh}"
    # Fully centred — the previous version was top-aligned which left
    # the panel floating in the upper third on tall phones. Now the
    # body is a flex column that vertical-centres the panel and
    # horizontal-centres everything inside it.
    b"body{display:flex;flex-direction:column;align-items:center;"
    b"justify-content:center;padding:32px 16px;"
    b"background-image:radial-gradient(60% 50% at 20% 0%,rgba(255,93,104,.12),transparent 60%),"
    b"radial-gradient(50% 45% at 85% 100%,rgba(162,155,254,.08),transparent 60%)}"
    b".brand{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px}"
    # Mascot — pulled from the public website over HTTPS. Browsers
    # allow HTTPS subresources on an HTTP page (the reverse is what's
    # blocked), so this renders fine on the badge-served HTTP page
    # without baking the PNG into firmware.
    b".brand .mascot{width:84px;height:84px;border-radius:18px;"
    b"background:var(--card);border:1px solid rgba(255,93,104,.4);"
    b"padding:6px;box-shadow:0 0 30px rgba(255,93,104,.25);object-fit:contain}"
    b".brand h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em}"
    b".panel{width:100%;max-width:440px;background:var(--card);border:1px solid var(--bord);"
    b"border-radius:14px;overflow:hidden}"
    b".pad{padding:24px}"
    b"h2{margin:0 0 6px;font-size:18px;font-weight:600}"
    b".sub{margin:0;color:var(--dim);font-size:13px;line-height:1.55}"
    b".chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;"
    b"font-size:11px;text-transform:uppercase;letter-spacing:.12em;background:var(--cardb);color:var(--dim)}"
    b".pulse{display:inline-block;width:8px;height:8px;border-radius:5px;background:var(--gold);"
    b"margin-right:8px;vertical-align:middle;animation:p 1.4s ease-in-out infinite}"
    b"@keyframes p{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}"
    # Code-input row — 6 separate slots so the user can't fat-finger
    # more than one char per box. Letter-spacing is fake-monospace.
    b".code-row{display:flex;gap:8px;justify-content:center;margin:14px 0 4px}"
    b".code-row input{width:46px;height:58px;border-radius:8px;border:1px solid var(--bord);"
    b"background:var(--bg);color:var(--pri);text-align:center;font-size:30px;font-weight:600;"
    b"font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;outline:none}"
    b".code-row input:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(255,93,104,.22)}"
    b".did{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;"
    b"letter-spacing:.32em;color:var(--teal);margin:14px 0 4px;text-align:center;"
    b"text-shadow:0 0 30px rgba(61,220,151,.35)}"
    # `.drop` is a <label>, which is inline by default — without an
    # explicit display:block the dashed border collapses to a thin
    # sliver around the (hidden) <input>, and the icon/labels float
    # outside the box. Force block layout so the dashed rectangle
    # spans the panel width as intended.
    b".drop{display:block;width:100%;border:2px dashed var(--bord);border-radius:10px;"
    b"padding:22px 18px;text-align:center;box-sizing:border-box;"
    b"cursor:pointer;transition:.2s border-color,.2s background;background:rgba(38,33,62,.4)}"
    b".drop:hover,.drop.over{border-color:var(--pri);background:rgba(255,93,104,.06)}"
    b".drop input{display:none}"
    b".drop .icon{font-size:30px;color:var(--pri);margin-bottom:4px;line-height:1}"
    b".drop .l1{font-weight:600;margin:6px 0 2px;font-size:14px}"
    b".drop .l2{margin:0;color:var(--mute);font-size:12px}"
    b".preview{display:none;align-items:center;gap:12px;background:var(--cardb);"
    b"border:1px solid var(--bord);border-radius:10px;padding:12px 14px}"
    b".thumb{width:60px;height:60px;border-radius:6px;background:var(--bg);flex-shrink:0;"
    b"display:grid;place-items:center;font-size:20px;color:var(--mute);overflow:hidden}"
    b".thumb img,.thumb video{width:100%;height:100%;object-fit:cover}"
    b".pmeta{flex:1;min-width:0}"
    b".pmeta .n{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    b".pmeta .s{font-size:12px;color:var(--mute);margin-top:2px}"
    b".btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;"
    b"background:var(--pri);color:var(--bg);border:0;border-radius:8px;padding:13px 18px;"
    b"font-size:15px;font-weight:600;width:100%;cursor:pointer;transition:.15s background}"
    b".btn:hover{background:#C8434C}"
    b".btn:disabled{background:#4A4458;color:var(--mute);cursor:not-allowed}"
    b".btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--bord)}"
    b".btn.ghost:hover{background:var(--cardb)}"
    b".status{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:8px;"
    b"background:var(--cardb);font-size:13px;color:var(--dim)}"
    b".status .dot{width:8px;height:8px;border-radius:5px;background:var(--mute)}"
    b".status.live .dot{background:var(--gold);animation:p 1.4s ease-in-out infinite}"
    b".status.ok .dot{background:var(--teal)}"
    b".status.err .dot{background:var(--pri)}"
    b".err-msg{color:var(--pri);font-size:13px;text-align:center;margin:6px 0 0;min-height:18px}"
    b".progress{height:6px;background:var(--bord);border-radius:4px;overflow:hidden;margin-top:14px}"
    b".bar{height:100%;background:linear-gradient(90deg,var(--pri),var(--lilac));"
    b"width:0;transition:width .15s ease-out}"
    b".pct{margin-top:8px;font-size:12px;color:var(--mute);display:flex;justify-content:space-between}"
    b".stack>*+*{margin-top:14px}"
    b".hide{display:none!important}"
    b".foot{margin-top:18px;font-size:11px;color:var(--mute);text-align:center;max-width:440px}"
    b".foot a{color:var(--dim);text-decoration:none;border-bottom:1px dashed var(--bord)}"
    # Custom modal — replaces native alert() which (a) breaks the
    # branding and (b) on iOS Safari freezes the page until dismissed
    # AND shows the bare URL. The modal is always in the DOM, hidden
    # by default; show() flips .open on the backdrop.
    b".mdl{position:fixed;inset:0;background:rgba(15,12,28,.78);"
    b"backdrop-filter:blur(6px);display:none;align-items:center;"
    b"justify-content:center;padding:24px;z-index:50}"
    b".mdl.open{display:flex}"
    b".mdl .box{background:var(--card);border:1px solid var(--bord);"
    b"border-radius:14px;max-width:380px;width:100%;padding:22px;"
    b"box-shadow:0 30px 60px rgba(0,0,0,.5)}"
    b".mdl .ic{width:42px;height:42px;border-radius:10px;"
    b"display:grid;place-items:center;font-size:22px;margin-bottom:12px;"
    b"background:rgba(255,93,104,.15);color:var(--pri)}"
    b".mdl.ok .ic{background:rgba(61,220,151,.15);color:var(--teal)}"
    b".mdl h3{margin:0 0 6px;font-size:17px;font-weight:600}"
    b".mdl p{margin:0 0 16px;color:var(--dim);font-size:13px;line-height:1.55}"
    b".mdl .acts{display:flex;gap:8px}"
    b".mdl .acts .btn{flex:1;padding:11px 14px;font-size:14px}"
    # Reset row — pinned at the bottom of the panel so the user always
    # has a way out, even mid-upload. .reset is a low-key text button
    # so it doesn't compete with the primary action.
    b".reset{margin-top:14px;text-align:center}"
    b".reset button{background:transparent;border:0;color:var(--mute);"
    b"font-size:12px;cursor:pointer;text-decoration:underline;"
    b"text-decoration-color:var(--bord);text-underline-offset:3px}"
    b".reset button:hover{color:var(--ink)}"
    b"</style></head><body>"
    b"<div class='brand'>"
    b"<img class='mascot' src='/mascot.png' alt='Oreo'>"
    b"<h1>Send to Oreo</h1></div>"
    b"<div class='panel'>"
    # ── Stage 1: wait for badge owner to approve this device.
    # ── (The code-entry step is gone — by the time you land on this
    # ── page, the prefill hash has already auto-authed you, so we
    # ── just need the badge owner to tap A on the matching row.)
    b"<div id='wait' class='pad stack'>"
    b"<span class='chip'>step 1 of 2</span>"
    b"<h2>Waiting for badge owner</h2>"
    b"<p class='sub'>Your device ID is shown below &mdash; "
    b"it appears on the badge owner's screen too. "
    b"They have to tap <b>A</b> on the matching row to let you send a file.</p>"
    b"<div class='did' id='did'>__DEVICE_ID__</div>"
    b"<div class='status live' id='wstat'><span class='dot'></span>"
    b"<span id='wmsg'>waiting for approval&hellip;</span></div>"
    b"<div class='reset'><button type='button' onclick='resetAll()'>"
    b"Reset transaction</button></div>"
    b"</div>"
    # ── Stage 2: approved, pick a file ──
    b"<div id='form' class='pad stack hide'>"
    b"<span class='chip' style='background:rgba(61,220,151,.15);color:var(--teal)'>"
    b"approved &middot; <span id='okid' style='font-family:ui-monospace,monospace'>__DEVICE_ID__</span></span>"
    b"<h2>Pick a file to send</h2>"
    b"<p class='sub'>Images and videos are optimised in your browser before upload. "
    b"Video is capped at 10 seconds for smooth fullscreen playback.</p>"
    b"<label class='drop' id='drop'>"
    b"<input id='file' type='file' accept='image/*,video/*,.txt,.md'>"
    b"<div class='icon'>&uarr;</div>"
    b"<p class='l1'>Tap to choose or drop here</p>"
    b"<p class='l2'>PNG &middot; JPG &middot; GIF &middot; MP4 &middot; MOV &middot; WEBM &middot; TXT &middot; MD</p></label>"
    b"<div class='preview' id='preview'>"
    b"<div class='thumb' id='thumb'>?</div>"
    b"<div class='pmeta'><div class='n' id='pname'>&mdash;</div>"
    b"<div class='s' id='psize'>&mdash;</div></div></div>"
    b"<button id='go' class='btn' disabled>Send to badge</button>"
    b"<div class='progress'><div class='bar' id='bar'></div></div>"
    b"<div class='pct hide' id='pct'><span id='pctn'>0%</span>"
    b"<span id='pctb'>0 / 0 KB</span></div>"
    b"<div class='reset'><button type='button' onclick='resetAll()'>"
    b"Reset transaction</button></div></div>"
    # ── Stage 4: done ──
    b"<div id='done' class='pad stack hide' style='text-align:center'>"
    b"<div style='font-size:42px;color:var(--teal);line-height:1'>&#10003;</div>"
    b"<h2>Sent!</h2><p class='sub'>Open the matching app on your badge to view it.</p>"
    b"<button class='btn' onclick='location.reload()'>Send another</button></div>"
    b"</div>"
    # ── Custom modal — hidden until showModal() flips .open. ──
    b"<div class='mdl' id='mdl'><div class='box'>"
    b"<div class='ic' id='mdlIc'>!</div>"
    b"<h3 id='mdlT'>Something went wrong</h3>"
    b"<p id='mdlM'>&mdash;</p>"
    b"<div class='acts'>"
    b"<button class='btn ghost' id='mdlNo' onclick='closeModal()'>Dismiss</button>"
    b"<button class='btn' id='mdlYes' onclick='resetAll()'>Reset</button>"
    b"</div></div></div>"
    b"<div class='foot'>Peer-to-peer on your local network &middot; "
    b"Powered by <a href='https://oreo.elixpo.com' target='_blank'>oreo.elixpo.com</a></div>"
    b"<script>"
    b"const $=id=>document.getElementById(id);"
    b"const MAX_DIM=240,VIDEO_W=180,VIDEO_H=135,VIDEO_FPS=24,VIDEO_SECONDS=10,MAX_UPLOAD=8*1024*1024;"
    # The server inlined our device_id into the markup as
    # __DEVICE_ID__ before sending the page, so we just read it off
    # the DOM rather than running an auth handshake.
    b"const did=$('did').textContent.trim();"
    b"let approved=false,beaconBusy=false,beaconTimer=null,picked=null,activeXhr=null;"
    # Tracked from every beacon response so file-picker can do a
    # pre-flight space check without an extra round-trip. 0 = unknown
    # (treat the badge as full and warn) until the first beacon lands.
    b"let freeBytes=0;"
    # Headroom we leave on flash even when we 'fit' — the upload writes
    # the on-disk file PLUS a few small allocations (notification entry,
    # gc churn), so we refuse uploads that would land within this margin.
    b"const FREE_HEADROOM=64*1024;"
    b"function fmtKB(n){return (n/1024)<1024?(Math.round(n/1024)+' KB'):"
    b"((n/1024/1024).toFixed(2)+' MB');}"
    b"function setWaitStatus(cls,msg){const s=$('wstat');s.className='status '+cls;$('wmsg').textContent=msg;}"
    # ── Modal helpers — single dialog reused for every error/info. ──
    # kind: 'err' (default red) | 'ok' (green). resetable: show Reset
    # button vs. just a Dismiss. The Reset action calls resetAll().
    b"function showModal(title,msg,kind,resetable){"
    b"  const m=$('mdl');m.className='mdl open'+(kind==='ok'?' ok':'');"
    b"  $('mdlIc').textContent=(kind==='ok'?'\\u2713':'!');"
    b"  $('mdlT').textContent=title;$('mdlM').textContent=msg;"
    b"  $('mdlYes').style.display=resetable===false?'none':'';"
    b"  $('mdlNo').textContent=resetable===false?'OK':'Dismiss';}"
    b"function closeModal(){$('mdl').classList.remove('open');}"
    # resetAll(): cancel the in-flight upload (if any), then reload to
    # mint a fresh device session. The browser keeps the prefill hash
    # in the URL so the reload lands back on the upload page cleanly
    # (unless the code has rotated, in which case the 404 page is the
    # correct landing — user grabs a new URL from the website).
    b"function resetAll(){"
    b"  closeModal();"
    b"  try{if(activeXhr){activeXhr.abort();activeXhr=null;}}catch(e){}"
    b"  if(beaconTimer){clearInterval(beaconTimer);beaconTimer=null;}"
    b"  location.reload();}"
    # ── beacon poll for approval ──
    b"async function beacon(){"
    b"  if(!did||approved||beaconBusy)return;beaconBusy=true;"
    b"  try{const r=await fetch('/beacon?id='+did);"
    b"      if(r.status===410){"           # session expired server-side
    b"        clearInterval(beaconTimer);"
    b"        $('wait').innerHTML=\"<h2>Session expired</h2><p class='sub'>The "
    b"code rotated or the badge owner closed transfer. "
    b"<button class='btn ghost' onclick='location.reload()'>Try again</button>\";"
    b"        return;}"
    b"      const j=await r.json();"
    b"      if(typeof j.free==='number')freeBytes=j.free;"
    b"      if(j.state==='approved'){approved=true;clearInterval(beaconTimer);"
    b"        $('wait').classList.add('hide');$('form').classList.remove('hide');}"
    b"      else if(j.state==='denied'){clearInterval(beaconTimer);"
    b"        $('wait').innerHTML=\"<h2>Denied</h2><p class='sub'>The badge "
    b"owner rejected this device.</p>"
    b"<button class='btn ghost' onclick='location.reload()'>Try again</button>\";}"
    b"      else{setWaitStatus('live',j.state==='approving'?'approval received\\u2026':'waiting for approval on badge\\u2026');}}"
    b"  catch(e){setWaitStatus('err','badge unreachable - check WiFi');}"
    b"  finally{beaconBusy=false;}}"
    # Centralised handler for "the badge stopped responding to beacons
    # for too long" — surfaces the modal once so the user knows to
    # check WiFi rather than staring at a frozen yellow dot.
    b""
    # ── file picker / preview / browser-side media conversion ──
    b"function mediaKind(file){"
    b"  const n=file.name.toLowerCase();"
    b"  if(file.type.startsWith('image/')||/\\.(png|jpe?g|gif|webp)$/.test(n))return'image';"
    b"  if(file.type.startsWith('video/')||/\\.(mp4|mov|m4v|webm|avi)$/.test(n))return'video';"
    b"  return'document';}"
    b"function onFile(file){"
    b"  if(!file)return;"
    # Estimate the on-disk size: images convert to RGB565 (240x240 max
    # = ~115KB cap), everything else writes the raw file bytes. We
    # compare to freeBytes (most recent beacon reading) before letting
    # the user hit Send — this turns 'out of space' into a clean UX
    # error instead of a half-written file + 500 from the badge.
    b"  const kind=mediaKind(file),isImg=kind==='image',isVid=kind==='video';"
    b"  const estDiskBytes=isImg?(240*240*2+6):(isVid?0:file.size);"
    b"  if(freeBytes>0&&estDiskBytes+FREE_HEADROOM>freeBytes){"
    b"    showModal('Not enough space',"
    b"      'This badge only has '+fmtKB(freeBytes)+' free, which is not enough for a '+"
    b"      fmtKB(estDiskBytes)+' file. Delete a photo or document on the badge first.',"
    b"      'err',false);"
    b"    return;}"
    b"  picked=file;"
    b"  $('preview').style.display='flex';$('drop').style.display='none';"
    b"  $('pname').textContent=file.name;$('psize').textContent=fmtKB(file.size);"
    b"  const th=$('thumb');th.innerHTML='';"
    b"  if(isImg){"
    b"    const im=document.createElement('img');im.src=URL.createObjectURL(file);th.appendChild(im);}"
    b"  else if(isVid){"
    b"    const v=document.createElement('video');v.src=URL.createObjectURL(file);"
    b"    v.muted=true;v.playsInline=true;th.appendChild(v);}"
    b"  else{th.textContent=file.name.split('.').pop().toUpperCase();}"
    b"  $('go').disabled=false;}"
    b"async function imgToR565(file){"
    b"  const img=new Image();img.src=URL.createObjectURL(file);"
    b"  await new Promise((r,j)=>{img.onload=r;img.onerror=j;});"
    b"  const sc=Math.min(1,MAX_DIM/Math.max(img.width,img.height));"
    b"  const w=Math.max(1,Math.round(img.width*sc)),h=Math.max(1,Math.round(img.height*sc));"
    b"  const c=document.createElement('canvas');c.width=w;c.height=h;"
    b"  const ctx=c.getContext('2d');"
    b"  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);"
    b"  const px=ctx.getImageData(0,0,w,h).data;"
    b"  const raw=new Uint8Array(w*h*2);let o=0;"
    b"  for(let i=0;i<px.length;i+=4){"
    b"    const r=px[i]>>3,g=px[i+1]>>2,b=px[i+2]>>3;"
    b"    const v=(r<<11)|(g<<5)|b;raw[o++]=(v>>8)&0xff;raw[o++]=v&0xff;}"
    b"  const enc=await compressFrame(raw),head=new Uint8Array(12),n=raw.length;"
    b"  head.set([82,53,90,1]);head[4]=w&255;head[5]=w>>8;head[6]=h&255;head[7]=h>>8;"
    b"  head[8]=n&255;head[9]=(n>>8)&255;head[10]=(n>>16)&255;head[11]=(n>>24)&255;"
    b"  return new Blob([head,enc],{type:'application/octet-stream'});}"
    # RV565: 12-byte header followed by length-prefixed delta frames.
    # Each command covers 1..64 pixels: 00=unchanged, 01=literal RGB565,
    # 10=repeated colour. Exact unchanged areas are particularly effective
    # for UI captures and cartoons, while the resolution/FPS cap bounds
    # worst-case photographic footage.
    b"function encodeDelta(cur,prev){"
    b"  const out=[];let p=0,n=cur.length;"
    b"  while(p<n){"
    b"    if(cur[p]===prev[p]){let k=1;while(k<64&&p+k<n&&cur[p+k]===prev[p+k])k++;"
    b"      out.push(k-1);p+=k;continue;}"
    b"    let run=1;while(run<64&&p+run<n&&cur[p+run]===cur[p]&&cur[p+run]!==prev[p+run])run++;"
    b"    if(run>=3){const v=cur[p];out.push(0x80|(run-1),v>>8,v&255);p+=run;continue;}"
    b"    const start=p;p++;"
    b"    while(p<n&&p-start<64&&cur[p]!==prev[p]){"
    b"      let r=1;while(r<3&&p+r<n&&cur[p+r]===cur[p]&&cur[p+r]!==prev[p+r])r++;"
    b"      if(r>=3)break;p++;}"
    b"    out.push(0x40|(p-start-1));"
    b"    for(let i=start;i<p;i++){out.push(cur[i]>>8,cur[i]&255);}"
    b"  }return new Uint8Array(out);}"
    b"async function compressFrame(raw){"
    b"  if(typeof CompressionStream==='undefined')throw new Error('this browser cannot compress video frames');"
    b"  const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));"
    b"  return new Uint8Array(await new Response(stream).arrayBuffer());}"
    b"async function videoToRV565(file){"
    b"  const url=URL.createObjectURL(file),v=document.createElement('video');"
    b"  v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;"
    b"  try{await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=()=>j(new Error('unsupported video'));});"
    b"    const dur=Math.min(v.duration,VIDEO_SECONDS);"
    b"    if(!isFinite(dur)||dur<=0)throw new Error('video has no readable duration');"
    # A compact 4:3 source is expanded to 320x240 by the native playback
    # kernel. Cover scaling crops wide/tall edges rather than letterboxing.
    b"    const w=VIDEO_W,h=VIDEO_H;"
    b"    const count=Math.max(1,Math.floor(dur*VIDEO_FPS));"
    b"    const head=new Uint8Array(12);head.set([82,86,53,6]);"
    b"    head[4]=w&255;head[5]=w>>8;head[6]=h&255;head[7]=h>>8;"
    b"    head[8]=VIDEO_FPS;head[10]=count&255;head[11]=count>>8;"
    b"    const chunks=[head];"
    b"    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');"
    b"    for(let f=0;f<count;f++){"
    b"      const t=Math.min(f/VIDEO_FPS,Math.max(0,dur-.001));"
    b"      if(Math.abs(v.currentTime-t)>.001){await new Promise((r,j)=>{v.onseeked=r;v.onerror=j;v.currentTime=t;});}"
    b"      const sc=Math.max(w/v.videoWidth,h/v.videoHeight);"
    b"      const dw=v.videoWidth*sc,dh=v.videoHeight*sc;"
    b"      ctx.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh);"
    b"      const rgba=ctx.getImageData(0,0,w,h).data;"
    b"      const raw=new Uint8Array(w*h*2);"
    # Preserve the panel's full RGB565 colour precision. Deflate is lossless
    # and each frame remains independently seekable.
    b"      for(let i=0,o=0;i<rgba.length;i+=4,o++){const px=((rgba[i]>>3)<<11)|((rgba[i+1]>>2)<<5)|(rgba[i+2]>>3);raw[o*2]=px>>8;raw[o*2+1]=px&255;}"
    b"      const enc=await compressFrame(raw),sz=new Uint8Array(4),n=enc.length;"
    b"      sz[0]=n&255;sz[1]=(n>>8)&255;sz[2]=(n>>16)&255;sz[3]=(n>>24)&255;"
    b"      chunks.push(sz,enc);"
    b"      $('pctn').textContent='Optimising '+Math.round((f+1)*100/count)+'%';"
    b"      if((f&3)===3)await new Promise(r=>setTimeout(r,0));}"
    b"    return new Blob(chunks,{type:'application/octet-stream'});"
    b"  }finally{URL.revokeObjectURL(url);}}"
    b"async function send(){"
    b"  if(!picked||!did)return;$('go').disabled=true;$('pct').classList.remove('hide');"
    b"  let payload=picked,name=picked.name;"
    b"  const kind=mediaKind(picked);"
    b"  if(kind==='image'){"
    b"    try{payload=await imgToR565(picked);name=name.replace(/\\.[^.]+$/,'')+'.rz565';}"
    b"    catch(err){"
    b"      showModal('Image decode failed',String(err),'err',true);"
    b"      $('go').disabled=false;return;}}"
    b"  else if(kind==='video'){"
    b"    try{payload=await videoToRV565(picked);name=name.replace(/\\.[^.]+$/,'')+'.rv565';"
    b"      if(payload.size>MAX_UPLOAD||freeBytes>0&&payload.size+FREE_HEADROOM>freeBytes)"
    b"        throw new Error('optimised video needs '+fmtKB(payload.size)+', but the badge does not have enough space');}"
    b"    catch(err){showModal('Video conversion failed',String(err),'err',true);"
    b"      $('go').disabled=false;return;}}"
    b"  else{try{const raw=new Uint8Array(await picked.arrayBuffer());"
    b"    new TextDecoder('utf-8',{fatal:true}).decode(raw);const enc=await compressFrame(raw);"
    b"    const head=new Uint8Array(8),n=raw.length;head.set([79,68,90,1]);"
    b"    head[4]=n&255;head[5]=(n>>8)&255;head[6]=(n>>16)&255;head[7]=(n>>24)&255;"
    b"    payload=new Blob([head,enc],{type:'application/octet-stream'});"
    b"    name=name.replace(/\\.[^.]+$/,'')+(name.toLowerCase().endsWith('.md')?'.mdz':'.txtz');"
    b"    if(freeBytes>0&&payload.size+FREE_HEADROOM>freeBytes)throw new Error('compressed document does not fit');}"
    b"    catch(err){showModal('Document conversion failed',String(err),'err',true);$('go').disabled=false;return;}}"
    b"  const fd=new FormData();fd.append('f',payload,name);"
    b"  const xhr=new XMLHttpRequest();activeXhr=xhr;"
    b"  xhr.upload.addEventListener('progress',(ev)=>{"
    b"    if(ev.lengthComputable){const p=ev.loaded/ev.total;"
    b"      $('bar').style.width=(p*100)+'%';"
    b"      $('pctn').textContent=Math.round(p*100)+'%';"
    b"      $('pctb').textContent=fmtKB(ev.loaded)+' / '+fmtKB(ev.total);}});"
    # onload: success OR a server-side rejection. We treat "100% then
    # status===0" as success-with-dropped-response — the badge closed
    # the socket before the browser finished reading the 200 body, but
    # the bytes are already on flash. Reduces the false-alarm rate of
    # the "Network error" modal that used to fire here.
    b"  xhr.onload=()=>{activeXhr=null;if(xhr.status===200||xhr.status===0){"
    b"    $('form').classList.add('hide');$('done').classList.remove('hide');}"
    b"    else if(xhr.status===403){"
    b"      showModal('Device no longer approved',"
    b"        'The badge owner revoked this session. Reset to start a new one.',"
    b"        'err',true);$('go').disabled=false;}"
    b"    else{showModal('Upload failed','Server returned status '+xhr.status+'.',"
    b"        'err',true);$('go').disabled=false;}};"
    b"  xhr.onerror=()=>{activeXhr=null;"
    # If the upload byte counter reached the total before the error
    # fired, the file landed on flash and the badge just closed the
    # socket too early. Surface this as a success rather than a scary
    # network error.
    b"    const w=parseInt($('bar').style.width)||0;"
    b"    if(w>=99){$('form').classList.add('hide');$('done').classList.remove('hide');return;}"
    b"    showModal('Network error',"
    b"      'Lost connection to the badge. Check that both devices are on the same WiFi, then reset.',"
    b"      'err',true);$('go').disabled=false;};"
    b"  xhr.open('POST','/upload?token='+did);xhr.send(fd);}"
    b"document.addEventListener('DOMContentLoaded',()=>{"
    # No code-entry step any more — start the beacon poll
    # immediately so the page tracks approval state from the moment
    # it loads.
    b"  beaconTimer=setInterval(beacon,500);beacon();"
    b"  $('file').addEventListener('change',e=>onFile(e.target.files[0]));"
    b"  const dz=$('drop');"
    b"  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over');}));"
    b"  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over');}));"
    b"  dz.addEventListener('drop',e=>{if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0]);});"
    b"  $('go').addEventListener('click',send);});"
    b"</script></body></html>"
)


# Served by every endpoint when `transfer_enabled` is False. The
# badge owner long-pressed LEFT on Send Files to close the subsystem
# — show them a friendly explanation instead of a bare 503.
_DISABLED_PAGE = (
    b"<!doctype html><html><head>"
    b"<meta name='viewport' content='width=device-width,initial-scale=1'>"
    b"<meta name='theme-color' content='#0F0C1C'>"
    b"<title>Transfer disabled</title>"
    b"<style>body{margin:0;padding:48px 24px;background:#0F0C1C;color:#F5E6DC;"
    b"font-family:-apple-system,system-ui,sans-serif;text-align:center}"
    b"h1{color:#FF5D68;font-size:24px;margin:0 0 12px}"
    b"p{color:#C8B8B0;font-size:14px;line-height:1.6;max-width:380px;margin:0 auto}"
    b".mark{display:inline-block;width:38px;height:38px;border-radius:8px;"
    b"border:1px solid rgba(255,93,104,.4);color:#FF5D68;font-weight:700;"
    b"display:grid;place-items:center;margin:0 auto 18px;font-size:20px}"
    b"</style></head><body>"
    b"<div class='mark'>o</div>"
    b"<h1>Transfer is disabled</h1>"
    b"<p>The badge owner has closed file transfer for safety. "
    b"Ask them to re-enable it from the badge's "
    b"<b>Settings &rsaquo; WiFi &rsaquo; Send Files</b> page.</p>"
    b"</body></html>"
)


# Served when GET / arrives without a valid `?prefill=<hash>` —
# either no query string at all, or a stale prefill from a prior
# code that has since rotated. No code-entry form is exposed here
# (that would let any LAN scanner brute-force the code), just a
# direct pointer back to oreo.elixpo.com/upload where they can
# re-grab a fresh URL.
_NOT_FOUND_PAGE = (
    b"<!doctype html><html lang='en'><head>"
    b"<meta name='viewport' content='width=device-width,initial-scale=1'>"
    b"<meta name='theme-color' content='#0F0C1C'>"
    b"<title>Bad code &middot; Oreo</title>"
    b"<style>"
    b":root{--bg:#0F0C1C;--card:#1C1A2E;--bord:#2A2640;"
    b"--ink:#F5E6DC;--dim:#C8B8B0;--mute:#8A8294;--pri:#FF5D68}"
    b"*{box-sizing:border-box}"
    b"html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);"
    b"font-family:-apple-system,system-ui,sans-serif;min-height:100vh}"
    b"body{display:flex;flex-direction:column;align-items:center;"
    b"justify-content:center;padding:24px;text-align:center;"
    b"background-image:radial-gradient(60% 50% at 20% 0%,rgba(255,93,104,.12),transparent 60%),"
    b"radial-gradient(50% 45% at 85% 100%,rgba(162,155,254,.08),transparent 60%)}"
    b".mark{width:48px;height:48px;border-radius:10px;border:1px solid rgba(255,93,104,.4);"
    b"background:var(--card);display:grid;place-items:center;font-weight:700;"
    b"color:var(--pri);font-size:22px;margin-bottom:18px;"
    b"box-shadow:0 0 30px rgba(255,93,104,.25)}"
    b".code{font-size:60px;font-weight:700;color:var(--pri);margin:0 0 6px;"
    b"line-height:1;letter-spacing:-.02em}"
    b"h1{font-size:22px;margin:8px 0 8px;font-weight:600}"
    b"p{color:var(--dim);font-size:14px;line-height:1.55;max-width:380px;margin:0 0 18px}"
    b".btn{display:inline-flex;align-items:center;gap:8px;background:var(--pri);"
    b"color:var(--bg);border:0;border-radius:8px;padding:12px 20px;"
    b"font-size:14px;font-weight:600;text-decoration:none}"
    b"</style></head><body>"
    b"<div class='mark'>o</div>"
    b"<p class='code'>404</p>"
    b"<h1>Bad or expired code</h1>"
    b"<p>This page only opens when launched from "
    b"<b>oreo.elixpo.com/upload</b> with the current 6-character "
    b"code shown on the badge. The code rotates every 5 minutes "
    b"&mdash; head back and grab a fresh one.</p>"
    b"<a class='btn' href='https://oreo.elixpo.com/upload'>Open oreo.elixpo.com/upload</a>"
    b"</body></html>"
)


def _parse_query(path):
    """Return (path_without_query, {key: value}) — minimal urlparse
    replacement since MicroPython doesn't ship one. Decodes %xx."""
    if "?" not in path:
        return path, {}
    pure, _, qs = path.partition("?")
    out = {}
    for part in qs.split("&"):
        if not part:
            continue
        k, _, v = part.partition("=")
        out[_pct(k)] = _pct(v)
    return pure, out


def _pct(s):
    """Tiny percent-decode. Only handles the ASCII subset we expect
    in our query params — IDs are alphanumeric, no spaces."""
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "%" and i + 2 < len(s):
            try:
                out.append(chr(int(s[i + 1:i + 3], 16)))
                i += 3
                continue
            except ValueError:
                pass
        out.append(c)
        i += 1
    return "".join(out)


def _peer_addr(sock):
    """Best-effort peer address for the session log."""
    try:
        addr = sock.getpeername()
        return "%s:%d" % (addr[0], addr[1])
    except Exception:
        return ""


def _handle(sock):
    """One request, one response. Closes on return."""
    head, after_head = _read_until(sock, b"\r\n\r\n", 8 * 1024,
                                   deadline_ms=HEAD_DEADLINE_MS)
    if head is None:
        _send_status(sock, 408, "Request Timeout", b"timeout")
        return
    try:
        sock.settimeout(RECV_TIMEOUT)
    except Exception:
        pass
    method, full_path, headers = _parse_headers(head)
    path, qs = _parse_query(full_path)

    # ── master kill switch ──
    # When the badge owner has flipped the transfer off (long-press
    # LEFT on Send Files), every endpoint returns 503 with a tiny
    # branded page. We DO still serve /favicon.ico as 204 so the
    # browser tab doesn't show a broken icon.
    if not _transfer_enabled:
        if method == "GET" and path == "/favicon.ico":
            _send_status(sock, 204, "No Content", b"")
            return
        _send_status(sock, 503, "Service Unavailable",
                     _DISABLED_PAGE)
        return

    if method == "GET" and path in ("/", "/index.html"):
        # The page is gated on `?prefill=<hash>` matching the live
        # code's hash. No prefill, wrong prefill, or expired prefill
        # all serve the 404 page — no code-entry form, no surface
        # area for a guesser to brute-force from the LAN.
        _handle_root(sock, qs, _peer_addr(sock))
        return
    if method == "GET" and path == "/favicon.ico":
        _send_status(sock, 204, "No Content", b"")
        return
    if method == "GET" and path == "/mascot.png":
        _handle_mascot(sock)
        return
    if method == "GET" and path == "/beacon":
        _handle_beacon(sock, qs, _peer_addr(sock))
        return
    if method == "POST" and path == "/upload":
        _handle_upload(sock, headers, after_head, qs)
        return

    _send_status(sock, 404, "Not Found", _NOT_FOUND_PAGE)


_MASCOT_CACHE = None    # bytes lazily loaded on first request


def _handle_mascot(sock):
    """Serve oreoOS/mascot.png as the page's <img> source. Cached in
    RAM after the first read since the file is tiny (~8 KB) and the
    page references it on every load."""
    global _MASCOT_CACHE
    if _MASCOT_CACHE is None:
        try:
            with open("oreoOS/mascot.png", "rb") as f:
                _MASCOT_CACHE = f.read()
        except Exception:
            # Fallback path layouts — some deploys flatten oreoOS into
            # the FS root. Try the bare filename before giving up.
            try:
                with open("mascot.png", "rb") as f:
                    _MASCOT_CACHE = f.read()
            except Exception:
                _MASCOT_CACHE = b""
    if not _MASCOT_CACHE:
        _send_status(sock, 404, "Not Found", b"missing mascot")
        return
    head = ("HTTP/1.1 200 OK\r\n"
            "Content-Type: image/png\r\n"
            "Content-Length: %d\r\n"
            "Cache-Control: public, max-age=86400\r\n"
            "Connection: close\r\n\r\n") % len(_MASCOT_CACHE)
    try:
        _send_bytes(sock, head.encode())
        _send_bytes(sock, _MASCOT_CACHE)
    except Exception:
        pass


def _handle_root(sock, qs, peer_addr):
    """GET / — entry point. Auto-authenticates against the prefill
    hash and renders the upload page with the device_id inlined.
    Wrong / missing prefill renders the branded 404 page so no
    randomly-crawled URL ever lands on a working form."""
    prefill = (qs.get("prefill", "") or "").lower()
    expected = code_hash().lower()
    if not prefill or prefill != expected:
        # Two reasons we land here: the URL was hit without a prefill,
        # or the prefill was correct ~minutes ago but the code has
        # since rotated. Same response either way — direct the user
        # back to the website to grab a fresh code.
        _send_status(sock, 404, "Not Found", _NOT_FOUND_PAGE)
        return

    # Prefill matched → mint a device session for this client.
    _prune_sessions()
    if len(_sessions) >= SESSION_MAX:
        _send_status(sock, 503, "Service Unavailable", _DISABLED_PAGE)
        return
    device_id = _new_session_id()
    try:
        import time as _t
        now = _t.ticks_ms()
    except Exception:
        now = 0
    _sessions[device_id] = {
        "state":     "authed",
        "last_ms":   now,
        "addr":      peer_addr,
        "uploads":   0,
        "authed_at": now,
    }
    try:
        print("[http] auto-authed via prefill: device_id=%s" % device_id)
    except Exception:
        pass

    # Inline the device_id into the served page by replacing a
    # placeholder. Done as a one-pass bytes.replace so we keep the
    # form as a compile-time constant and pay the substitution cost
    # only on the (rare) success path.
    body = _UPLOAD_FORM.replace(b"__DEVICE_ID__", device_id.encode())
    _send_status(sock, 200, "OK", body)


def _handle_beacon(sock, qs, peer_addr):
    """Heartbeat from an authed sender's browser. Only refreshes
    sessions already in the dict — never creates new ones. A sender
    that hasn't /auth'd is invisible and stays invisible."""
    sid = qs.get("id", "")
    if not sid or len(sid) != 6:
        _send_status(sock, 400, "Bad Request",
                     b'{"error":"missing id"}',
                     content_type="application/json")
        return
    _prune_sessions()
    s = _sessions.get(sid)
    if s is None:
        # Session expired or was denied — tell the client so it can
        # re-prompt for the code. We deliberately do NOT auto-create
        # the session here (that's the inverted protocol).
        _send_status(sock, 410, "Gone",
                     b'{"error":"session expired","state":"gone"}',
                     content_type="application/json")
        return
    try:
        import time as _t
        s["last_ms"] = _t.ticks_ms()
    except Exception:
        pass
    if peer_addr:
        s["addr"] = peer_addr
    # The owner decision is complete as soon as an authenticated browser
    # checks back in. Return `approved` in this same response so the upload
    # form opens without another polling interval.
    if s.get("state") == "approving":
        s["state"] = "approved"
    # Surface the badge's current free space on every beacon — the
    # upload page uses it for a pre-flight size check the moment the
    # user picks a file (cheap, no extra round-trip). statvfs is fast
    # enough to call per beacon (~ms on ESP32-S3 flash).
    fb = free_bytes()
    body = ('{"device_id":"%s","state":"%s","free":%d}'
            % (sid, s["state"], fb)).encode()
    _send_status(sock, 200, "OK", body, content_type="application/json")


def _handle_upload(sock, headers, body_prefix, qs):
    """Stream a single multipart part to disk. Phones POST exactly one
    file per share, so we don't try to handle multi-part bodies — we
    extract the first file part and ignore everything after.

    Gated on `?token=XXXXXX`: the session must exist AND be in state
    "approved", which only happens after the user explicitly taps Allow
    on the badge's WiFi/Transfer page. Without that the badge silently
    accepting uploads from anyone on the LAN would be a footgun.
    """
    token = qs.get("token", "")
    s = _sessions.get(token) if token else None
    if s is None or s.get("state") != "approved":
        _send_status(sock, 403, "Forbidden",
                     b'{"error":"token not approved"}',
                     content_type="application/json")
        return
    ctype = headers.get("content-type", "")
    if "multipart/form-data" not in ctype:
        _send_status(sock, 400, "Bad Request", b"expected multipart/form-data")
        return
    # Extract boundary= from the Content-Type header. RFC 7578 wraps it
    # in quotes sometimes; strip them.
    bidx = ctype.find("boundary=")
    if bidx < 0:
        _send_status(sock, 400, "Bad Request", b"missing boundary")
        return
    boundary = ctype[bidx + len("boundary="):].split(";", 1)[0].strip().strip('"')
    if not boundary:
        _send_status(sock, 400, "Bad Request", b"empty boundary")
        return
    boundary_marker = ("--" + boundary).encode()

    try:
        clen = int(headers.get("content-length", "0"))
    except ValueError:
        clen = 0
    if clen <= 0 or clen > MAX_BODY:
        _send_status(sock, 413, "Payload Too Large", b"file too large")
        return
    # Content-Length includes a small multipart envelope, so this is a
    # conservative admission check. It runs before a .part file is created.
    if clen + 64 * 1024 > free_bytes():
        _send_status(sock, 507, "Insufficient Storage", b"not enough free space")
        return

    # Find the first part's header block.
    head_buf = bytearray(body_prefix)
    bytes_read = len(body_prefix)
    while head_buf.find(b"\r\n\r\n") < 0:
        if bytes_read > 16 * 1024 or bytes_read >= clen:
            _send_status(sock, 400, "Bad Request", b"part header missing")
            return
        try:
            chunk = sock.recv(READ_CHUNK)
        except OSError:
            _send_status(sock, 408, "Request Timeout", b"timeout reading part header")
            return
        if not chunk:
            _send_status(sock, 400, "Bad Request", b"truncated")
            return
        head_buf.extend(chunk)
        bytes_read += len(chunk)
    hdr_end = head_buf.find(b"\r\n\r\n")
    part_head = bytes(head_buf[:hdr_end])
    rest      = bytes(head_buf[hdr_end + 4:])

    # Extract filename from Content-Disposition.
    cd = ""
    for line in part_head.decode("utf-8", "ignore").split("\r\n"):
        if line.lower().startswith("content-disposition:"):
            cd = line
            break
    fname = ""
    fkey = "filename="
    fi = cd.find(fkey)
    if fi >= 0:
        rest_cd = cd[fi + len(fkey):]
        if rest_cd.startswith('"'):
            end = rest_cd.find('"', 1)
            if end > 0:
                fname = rest_cd[1:end]
        else:
            fname = rest_cd.split(";", 1)[0].strip()
    fname = _safe_filename(fname)

    dest_dir, kind = _route_for(fname)
    if dest_dir is None:
        _send_status(sock, 415, "Unsupported Media Type",
                     ("rejected: " + str(kind)).encode())
        return

    _ensure_dir(dest_dir)
    dst_path = dest_dir + "/" + fname
    # If something with this name already exists, suffix a counter so we
    # don't clobber. Cheap and predictable.
    if _os is not None:
        try:
            _os.stat(dst_path)
            base = fname
            ext = ""
            dot = base.rfind(".")
            if dot > 0:
                base, ext = base[:dot], base[dot:]
            i = 1
            while True:
                cand = "%s/%s-%d%s" % (dest_dir, base, i, ext)
                try:
                    _os.stat(cand)
                    i += 1
                except OSError:
                    dst_path = cand
                    break
        except OSError:
            pass

    # Stream the rest of the body into the file, scanning for the
    # closing boundary. The "tail buffer" trick: keep the last
    # (len(boundary)+8) bytes unwritten until we're sure they're not
    # the start of the closing marker.
    closing = b"\r\n" + boundary_marker
    tail_keep = len(closing) + 4
    written = 0
    part_path = dst_path + ".part"
    try:
        try:
            _os.remove(part_path)
        except OSError:
            pass
        f = open(part_path, "wb")
    except Exception:
        _send_status(sock, 500, "Internal Error",
                     b"write failed (out of space?)")
        return

    # Publish a live progress slot the WiFi UI polls every frame to
    # render the progress bar. Total here is the *body length*, not
    # the file length (we don't know the file length until we hit the
    # closing boundary). Off by ~boundary-length bytes — good enough.
    global _progress
    _progress = {"id": token, "filename": fname,
                 "received": 0, "total": clen}

    try:
        buf = bytearray(rest)
        body_left = clen - bytes_read  # bytes still on the wire after we filled head_buf
        while True:
            # If `buf` contains the closing boundary, flush up to it and stop.
            idx = buf.find(closing)
            if idx >= 0:
                f.write(bytes(buf[:idx]))
                written += idx
                break
            # Otherwise flush all but the last tail_keep bytes (they
            # might be the start of the boundary).
            if len(buf) > tail_keep:
                cut = len(buf) - tail_keep
                f.write(bytes(buf[:cut]))
                written += cut
                buf = buf[cut:]
            if body_left <= 0 and not buf:
                f.write(bytes(buf))
                written += len(buf)
                break
            try:
                chunk = sock.recv(READ_CHUNK)
            except OSError:
                break
            if not chunk:
                f.write(bytes(buf))
                written += len(buf)
                break
            body_left -= len(chunk)
            buf.extend(chunk)
            # Live progress update — the WiFi UI samples this at 4 Hz
            # so an O(1) dict assignment per chunk is fine.
            _progress["received"] = written + max(0, len(buf) - tail_keep)
            if written > MAX_BODY:
                break
    finally:
        try:
            f.close()
        except Exception:
            pass
        _progress = None

    # Drain any trailing bytes the browser still has on the wire —
    # the closing `--boundary--\r\n` and the form-trailer. If we
    # close() with unread bytes in the kernel buffer the badge sends
    # a TCP RST and the browser surfaces it as a "Network error" even
    # though the file is already on flash. A short read loop is
    # cheaper than the false-alarm modals it prevents.
    try:
        sock.settimeout(0.2)
        drained = 0
        while drained < 4096:
            try:
                chunk = sock.recv(512)
            except Exception:
                break
            if not chunk:
                break
            drained += len(chunk)
    except Exception:
        pass
    try:
        sock.settimeout(RECV_TIMEOUT)
    except Exception:
        pass

    if written <= 0:
        try:
            _os.remove(part_path)
        except Exception:
            pass
        _send_status(sock, 400, "Bad Request", b"empty upload")
        return

    if not _validate_uploaded_asset(part_path, kind):
        try:
            _os.remove(part_path)
        except Exception:
            pass
        _send_status(sock, 422, "Unprocessable Content", b"invalid or truncated asset")
        return
    try:
        _os.rename(part_path, dst_path)
    except Exception:
        try:
            _os.remove(part_path)
        except Exception:
            pass
        _send_status(sock, 500, "Internal Error", b"could not commit upload")
        return

    # Mark the upload on the session so the WiFi UI can show "got 2
    # files from session ABCD12" instead of just "approved".
    if token in _sessions:
        _sessions[token]["uploads"] = _sessions[token].get("uploads", 0) + 1

    # Bump the last-upload timestamp + filename so the WiFi UI can
    # show the bottom "Received" toast for a couple of seconds. We
    # don't push directly into the app layer — keeps http_server
    # decoupled from any specific screen.
    global _last_upload_ts, _last_upload_name
    try:
        import time as _t
        _last_upload_ts = _t.ticks_ms()
    except Exception:
        _last_upload_ts = 0
    _last_upload_name = fname

    # Reclaim the multipart-stream buffers before any subsequent tick
    # tries to do anything else on a small heap. Upload paths allocate
    # several KB of bytes objects that the previous version left for
    # the next implicit GC — long enough that the next frame's paint
    # could OOM-trigger an MP allocation stall (which presents as a
    # full-screen freeze, not a reset). Explicit collect here keeps
    # the post-upload UI responsive.
    try:
        gc.collect()
    except Exception:
        pass

    # Surface the new file in the notification panel so the user knows
    # where it landed without having to open the Gallery or Reader.
    target_app = "gallery" if kind in ("image", "video") else "reader"
    try:
        from oreoOS import notifications
        notifications.push("wifi",
                           "Received %s" % kind,
                           "%s · %d KB" % (fname[:18], written // 1024),
                           target=target_app)
    except Exception:
        pass

    # We deliberately DON'T auto-launch the receiving app — the file
    # is already on flash and Gallery / Reader will pick it up the
    # next time the user opens those apps. The notification above is
    # the "your file arrived" cue.

    body = (b"<!doctype html><html><head>"
            b"<meta http-equiv='refresh' content='2; url=/'>"
            b"<title>Sent</title>"
            b"<style>body{font-family:-apple-system,system-ui,sans-serif;"
            b"background:#0f0c1c;color:#f5e6dc;text-align:center;padding-top:80px}"
            b"h1{color:#ff5d68}</style></head><body>"
            b"<h1>Sent &#10003;</h1>"
            b"<p>Returning to upload form...</p></body></html>")
    _send_status(sock, 200, "OK", body)
