"""Bluetooth (BLE) manager for the Oreo Badge.

Advertises as **Oreo** (GAP Complete Local Name). Exposes a tiny custom
GATT service so a paired phone / laptop can push a single image or text
document to the badge:

  Service: 6f72-656f-0000-1000-8000-00805f9b34fb   ("oreo" in ASCII)
  Char RX (write):    ...0001-...   host  → badge   (chunked payload)
  Char TX (notify):   ...0002-...   badge → host    (status codes)

Wire format on RX (concatenated across one or many writes):

  +------+----+----+----+----+----------------+--------+
  | type | length (4B, big-endian)            | bytes  | crc32 (4B)
  +------+----+----+----+----+----------------+--------+
   1B    └──────── 4 bytes ────────┘   payload (length B)

  type=b'I'  image    (raw bytes, written as-is — must be < IMAGE_MAX bytes)
  type=b'T'  text     (deflate-compressed UTF-8 — decompressed on landing)
  type=b'M'  markdown (deflate-compressed UTF-8 — rendered by the reader app)

Routing (per the v1 decision):
  images   → apps/gallery/assets/raw/bt_<ts>.<ext>
  text     → documents/bt_<ts>.txt
  markdown → documents/bt_<ts>.md

Status codes notified back over TX (single byte):
  0x01 START_OK          header accepted, sending payload
  0x02 DONE              file written successfully
  0xE1 TOO_LARGE         image payload > IMAGE_MAX
  0xE2 BAD_CRC           checksum failed
  0xE3 BAD_TYPE          unknown type byte
  0xE4 DECOMPRESS_FAIL   deflate raised
  0xE5 WRITE_FAIL        filesystem error (likely out of space)

Usage:
    from oreoWare import bt
    bt.set_active(True)
    bt.is_active()
"""

DEVICE_NAME = "Oreo"
IMAGE_MAX   = 250 * 1024    # 250 KB hard cap on incoming images.

GALLERY_DIR  = "apps/gallery/assets/raw"
DOCUMENTS_DIR = "documents"

_STATUS_START_OK         = b"\x01"
_STATUS_DONE             = b"\x02"
_STATUS_TOO_LARGE        = b"\xE1"
_STATUS_BAD_CRC          = b"\xE2"
_STATUS_BAD_TYPE         = b"\xE3"
_STATUS_DECOMPRESS_FAIL  = b"\xE4"
_STATUS_WRITE_FAIL       = b"\xE5"


_ble        = None
_rx_handle  = None
_tx_handle  = None
_conn       = None    # current central connection handle
_rx_state   = None    # active reassembler, if any
_conn_started_ms = None    # ticks_ms at the last CENTRAL_CONNECT, used
                           # to log how long the link survived on a
                           # subsequent CENTRAL_DISCONNECT
_conn_addr_type  = None    # addr_type from the live CENTRAL_CONNECT —
                           # needed so we can bond inbound pairs
_conn_addr_bytes = None    # raw addr bytes from the live CENTRAL_CONNECT

_HEADER_LEN = 5       # type (1) + length (4)
_CRC_LEN    = 4


# ── discovery state (BLE central-role scan) ─────────────────────────────
# scan_results is mac_str → entry with {name, mac, rssi, appearance,
# services, type, last_seen_ms}. Updated from the _IRQ_SCAN_RESULT handler
# below; consumed by apps/bt for the Nearby list.

_scan_results = {}
_scan_active  = False

# Appearance ranges we DROP from the Nearby list. Bluetooth appearance is
# a 16-bit field laid out as 10-bit category + 6-bit subtype, so each
# 0x40-wide window is one category.
_FILTERED_APPEARANCES = (
    (0x0840, 0x087F),   # Audio Sink (speakers, soundbars)
    (0x0880, 0x08BF),   # Audio Source
    (0x0940, 0x097F),   # Wearable Audio (earbuds, headphones)
    (0x0980, 0x09BF),   # Hearing aid
    (0x09C0, 0x09FF),   # Microphone subcategory
)

# Service-UUID blocklist (16-bit profiles) — secondary filter for devices
# that don't advertise an appearance.
_AUDIO_SERVICE_UUIDS = (
    0x110A, 0x110B, 0x110C, 0x110D, 0x110E,   # A2DP / AVRCP
    0x1108, 0x111E, 0x1112,                    # Headset / HFP
    0x184E, 0x184F, 0x1850, 0x1851, 0x1852,   # LE Audio profiles
)


def _is_audio_appearance(app):
    if app is None:
        return False
    for lo, hi in _FILTERED_APPEARANCES:
        if lo <= app <= hi:
            return True
    return False


def _has_audio_service(services):
    for s in services:
        if s in _AUDIO_SERVICE_UUIDS:
            return True
    return False


def _classify_appearance(app):
    """Return a short tag for the type column. Unknown → 'other'."""
    if app is None:
        return "other"
    if 0x0040 <= app <= 0x007F: return "phone"
    if 0x0080 <= app <= 0x00BF: return "computer"
    if 0x00C0 <= app <= 0x00FF: return "watch"
    if 0x0140 <= app <= 0x017F: return "display"   # incl. tablet
    return "other"


# AD record types (BT Core Spec 5.x Vol 3 Part C 18.x)
_AD_FLAGS              = 0x01
_AD_INCOMPLETE_UUID16  = 0x02
_AD_COMPLETE_UUID16    = 0x03
_AD_SHORT_NAME         = 0x08
_AD_COMPLETE_NAME      = 0x09
_AD_TX_POWER           = 0x0A
_AD_APPEARANCE         = 0x19
_AD_MANUFACTURER       = 0xFF

# Company IDs we'll surface as "label hints" when a peer omits its name
# (common on iOS, which suppresses the GAP name until pairing). The full
# Bluetooth SIG assigned-numbers list is huge; we cover the brands the
# user is most likely to see in a conference hall.
_MFR_TAGS = {
    0x004C: "Apple",         # iPhone, iPad, Mac, AirPods
    0x0006: "Microsoft",     # Surface, Xbox
    0x00E0: "Google",        # Pixel, Chromebook
    0x0075: "Samsung",
    0x038F: "Xiaomi",
    0x0157: "Anker",
    0x012D: "Sony",
    0x0001: "Ericsson",
    0x0059: "Nordic",        # nRF dev boards
}


def _parse_adv(adv_data):
    """Walk AD structures. Returns (name, appearance, [uuid16…], mfr_id).
    Tolerates malformed payloads — we never trust a peer advertiser to
    be conformant. mfr_id is the first 16-bit Company Identifier from
    a manufacturer-specific data record (AD type 0xFF), or None."""
    name       = None
    appearance = None
    services   = []
    mfr_id     = None
    if not adv_data:
        return name, appearance, services, mfr_id
    i = 0
    n = len(adv_data)
    while i < n:
        try:
            ln = adv_data[i]
        except IndexError:
            break
        if ln == 0:
            break
        if i + ln >= n:
            break
        ad_type = adv_data[i + 1]
        payload = adv_data[i + 2 : i + 1 + ln]
        if ad_type in (_AD_COMPLETE_NAME, _AD_SHORT_NAME):
            try:
                # Strip embedded NULs and trailing whitespace — iOS
                # sometimes pads short names with NUL.
                name = bytes(payload).decode("utf-8").rstrip("\x00").strip()
                if not name:
                    name = None
            except Exception:
                name = None
        elif ad_type == _AD_APPEARANCE and len(payload) >= 2:
            appearance = payload[0] | (payload[1] << 8)
        elif ad_type in (_AD_INCOMPLETE_UUID16, _AD_COMPLETE_UUID16):
            for j in range(0, len(payload), 2):
                if j + 1 < len(payload):
                    services.append(payload[j] | (payload[j + 1] << 8))
        elif ad_type == _AD_MANUFACTURER and len(payload) >= 2:
            # First two bytes are the little-endian Company ID; the rest
            # is vendor-specific. We only keep the Company ID — that's
            # enough to label "Apple" / "Samsung" / etc in the UI.
            mfr_id = payload[0] | (payload[1] << 8)
        i += 1 + ln
    return name, appearance, services, mfr_id


def _mac_str(addr_bytes):
    try:
        return ":".join("%02X" % b for b in bytes(addr_bytes))
    except Exception:
        return "??:??:??:??:??:??"


# ── discovery API used by apps/bt ───────────────────────────────────────

def own_name():
    """Return the GAP Complete Local Name the badge advertises as."""
    try:
        return _get_ble().config("gap_name")
    except Exception:
        return DEVICE_NAME


def own_mac():
    """Public BLE MAC as 'AA:BB:CC:DD:EE:FF'."""
    try:
        addr = _get_ble().config("mac")
        # config('mac') returns either (type, bytes) or just bytes
        # depending on the MicroPython build. Handle both.
        if isinstance(addr, tuple) and len(addr) == 2:
            return _mac_str(addr[1])
        return _mac_str(addr)
    except Exception:
        return "—"


def scan_start(duration_ms=8000):
    """Begin a BLE central-role scan. Use scan_results() any time to read
    the cumulative list; scan_is_active() reports done/in-progress."""
    global _scan_active, _scan_results
    try:
        ble = _get_ble()
        if not ble.active():
            ble.active(True)
        _register_service(ble)
    except Exception:
        return False
    _scan_results = {}
    try:
        # active scan (last arg True) so we get scan-response data,
        # which more often carries the complete local name.
        ble.gap_scan(duration_ms, 30000, 30000, True)
        _scan_active = True
        return True
    except Exception:
        _scan_active = False
        return False


def scan_stop():
    global _scan_active
    try:
        _get_ble().gap_scan(None)
    except Exception:
        pass
    _scan_active = False


def scan_is_active():
    return _scan_active


def scan_results():
    """Name-deduped, RSSI-sorted snapshot of discovered BLE devices.

    No filtering. The earlier appearance/service blocklists hid phones
    and useful peripherals along with audio gear, and the trade wasn't
    worth it — the user wants to see *everything* the radio sees.

    iOS and recent Android phones rotate their Resolvable Private
    Address every ~15 min, so the same physical phone keeps showing
    up under fresh MACs. We collapse all entries that share a real
    (non-MAC-tail-fallback) name into one row, picking the strongest
    RSSI as the representative. Anonymous "device EE:FF" entries stay
    individual because we can't tell them apart.
    """
    by_name = {}
    anon    = []
    for v in _scan_results.values():
        nm = v.get("name") or ""
        if nm and not nm.startswith("device "):
            cur = by_name.get(nm)
            # Pick the entry with the better RSSI as the live one — its
            # mac/addr_type are the ones we'll try to connect to.
            if cur is None or (v.get("rssi", -999) > cur.get("rssi", -999)):
                by_name[nm] = v
        else:
            anon.append(v)
    out = list(by_name.values()) + anon
    out.sort(key=lambda d: d.get("rssi", -999), reverse=True)
    return out


# ── pair flow ───────────────────────────────────────────────────────────

def pair_state():
    """Tuple of (state, message, target_dict_or_None). UI polls this to
    drive the on-screen popup; state moves IDLE → CONNECTING →
    ENCRYPTING → DONE | FAILED on its own."""
    return _pair_state, _pair_message, _pair_target


def _set_pair_state(state, msg=""):
    global _pair_state, _pair_message
    _pair_state   = state
    _pair_message = msg


def pair_reset():
    """Clear DONE / FAILED state once the UI has read it."""
    global _pair_target
    _set_pair_state(PAIR_IDLE, "")
    _pair_target = None


def _addr_from_mac(mac_str):
    """'AA:BB:CC:DD:EE:FF' → bytes(6). Returns None on bad input."""
    try:
        parts = mac_str.split(":")
        if len(parts) != 6:
            return None
        return bytes(int(p, 16) for p in parts)
    except Exception:
        return None


def _apply_security_config(ble):
    """Enable bonding + LE Secure Connections with DISPLAY_YESNO IO caps.

    DISPLAY_YESNO + mitm=True asks the stack to negotiate the strongest
    method available with the peer; with a modern phone that's
    Numeric Comparison, which fires _IRQ_PASSKEY_ACTION on the badge so
    we can render a confirm prompt. Older peers that can't do SC fall
    back to legacy pairing.

    Each kwarg is wrapped individually so the radio still works in a
    degraded mode if an older MicroPython build is missing one of the
    keys. We PRINT which kwargs actually stuck so the user can see
    from the serial log whether the build supports Secure Connections
    at all — if `le_secure` or `mitm` got rejected, the stack drops
    to JustWorks pairing and the numeric-comparison prompt will never
    fire (which was the entire point of this config).
    """
    accepted = []
    rejected = []
    for kw in (
        {"bond":      True},
        {"mitm":      True},
        {"le_secure": True},
        {"io":        _IO_DISPLAY_YESNO},
    ):
        try:
            ble.config(**kw)
            accepted.append(list(kw.keys())[0])
        except Exception as e:
            rejected.append("%s(%s)" % (list(kw.keys())[0], str(e)[:24]))
    try:
        print("[bt] security: accepted=%s rejected=%s" %
              (",".join(accepted) or "-", ",".join(rejected) or "-"))
    except Exception:
        pass


def start_pair(target):
    """Kick off an outbound pair attempt.

      target = {"mac": str, "name": str, "kind": str,
                "addr_type": int, "addr": bytes_or_None}

    Returns True if the request was dispatched, False if BLE isn't
    available or pair flow is already in progress."""
    global _pair_target, _pair_state
    if _pair_state in (PAIR_CONNECTING, PAIR_ENCRYPTING):
        return False

    # Pull addr_type from the live scan dict if the caller didn't
    # pass one through — defaulting to 0 (PUBLIC) silently bricked
    # iPhone connections because iOS uses Random Resolvable addresses
    # (type 1). The scan IRQ stashes the correct type per-entry.
    mac_key   = (target.get("mac") or "").upper()
    scan_hit  = None
    for k, v in _scan_results.items():
        if k.upper() == mac_key:
            scan_hit = v
            break
    addr_type = target.get("addr_type")
    if addr_type is None and scan_hit is not None:
        addr_type = scan_hit.get("addr_type", 0)
    if addr_type is None:
        addr_type = 0
    addr = target.get("addr")
    if addr is None and scan_hit is not None:
        addr = scan_hit.get("addr")
    if addr is None:
        addr = _addr_from_mac(target.get("mac", ""))
    if addr is None:
        _set_pair_state(PAIR_FAILED, "bad mac")
        return False

    try:
        ble = _get_ble()
        if not ble.active():
            ble.active(True)
        _register_service(ble)
        _apply_security_config(ble)
    except Exception:
        _set_pair_state(PAIR_FAILED, "ble init failed")
        return False

    # Stop scanning before we initiate — many ESP32-S3 builds reject
    # gap_connect while a scan is running.
    try:
        scan_stop()
    except Exception:
        pass

    _pair_target = {
        "mac":       target.get("mac", "").upper(),
        "name":      target.get("name", ""),
        "kind":      target.get("kind", "other"),
        "addr_type": addr_type,
        "addr":      bytes(addr),
        "conn":      None,
    }
    _set_pair_state(PAIR_CONNECTING, "connecting...")
    try:
        ble.gap_connect(addr_type, bytes(addr))
        return True
    except Exception as e:
        _set_pair_state(PAIR_FAILED, "connect call failed")
        return False


def cancel_pair():
    """Abort an in-progress pair. Disconnects if we got far enough to
    have a conn handle."""
    global _pair_target
    if _pair_target and _pair_target.get("conn") is not None:
        try:
            _get_ble().gap_disconnect(_pair_target["conn"])
        except Exception:
            pass
    _pair_target = None
    _set_pair_state(PAIR_IDLE, "")


# ── bonded-device list (read-through to oreoOS.bonds) ───────────────────

def paired_devices():
    """Pulled from the on-flash bond store. Wrapped here so callers in
    apps/bt don't have to know about oreoOS.bonds."""
    try:
        from oreoOS import bonds
        return list(bonds.list_bonds())
    except Exception:
        return []


def forget(mac):
    try:
        from oreoOS import bonds
        return bonds.remove(mac)
    except Exception:
        return False


def _get_ble():
    global _ble
    if _ble is None:
        import bluetooth
        _ble = bluetooth.BLE()
    return _ble


def is_active():
    try:
        return _get_ble().active()
    except Exception:
        return False


def set_active(on):
    """Bring the radio up or down. On up, also registers the transfer
    service, applies JustWorks security so inbound pair attempts from
    phones don't fail on IO-capability mismatch, and starts advertising.

    The security config has to land BEFORE the first inbound connection
    or the stack will default to KEYBOARD_DISPLAY IO caps. When a phone
    then initiates bonding, our peripheral side claims it can show a
    passkey, the phone asks for one, the badge has nothing to give, and
    the link is dropped. With JustWorks (NO_INPUT_NO_OUTPUT) the pair
    completes silently.
    """
    try:
        ble = _get_ble()
        ble.active(on)
        if on:
            _apply_security_config(ble)
            _register_service(ble)
            _start_advertising(ble)
        else:
            try:
                ble.gap_advertise(None)   # stop adv
            except Exception:
                pass
        return True
    except Exception:
        return False


def toggle():
    return set_active(not is_active())


def init_from_config():
    """No-op on boot.

    Bluetooth is currently a Coming Soon feature — the BT settings
    page renders a placeholder and file transfer runs over WiFi
    (see oreoOS.http_server). Leaving the radio off at boot saves
    flash, RAM, and ~3-4 mA standby; the user can still flip BT on
    manually via a future settings toggle. When we wire the radio
    back into a real user flow (peer presence, IR-Quest assist, etc.)
    this function will read a `bt_enable` setting from oreoOS
    settings instead of the build-time .env flag.
    """
    return


# ─── service registration ────────────────────────────────────────────────

def _register_service(ble):
    """Idempotent — only registers once per boot."""
    global _rx_handle, _tx_handle
    if _rx_handle is not None:
        return
    import bluetooth
    _SVC_UUID = bluetooth.UUID("6f72656f-0000-1000-8000-00805f9b34fb")
    _RX_UUID  = bluetooth.UUID("6f72656f-0001-1000-8000-00805f9b34fb")
    _TX_UUID  = bluetooth.UUID("6f72656f-0002-1000-8000-00805f9b34fb")
    rx_char = (_RX_UUID, bluetooth.FLAG_WRITE | bluetooth.FLAG_WRITE_NO_RESPONSE)
    tx_char = (_TX_UUID, bluetooth.FLAG_NOTIFY)
    svc     = (_SVC_UUID, (rx_char, tx_char))
    try:
        ((_rx_handle, _tx_handle),) = ble.gatts_register_services((svc,))
    except Exception:
        _rx_handle = _tx_handle = None
        return
    # Allow the RX char to buffer a single MTU's worth — we drain it
    # every IRQ so this is sized for one chunk, not the whole file.
    try:
        ble.gatts_set_buffer(_rx_handle, 512, True)
    except Exception:
        pass
    ble.irq(_irq)


# ─── advertising ─────────────────────────────────────────────────────────

# Generic-tag appearance value — tells scanning phones to render us with
# a "generic" icon rather than "unknown peripheral". 0x0000 is the safest
# value across iOS / Android — it reads as "Unknown" but still passes
# their "advertiser must declare an Appearance" filters. If we ever ship
# a watch form factor, 0x00C0 (Generic Watch) would be a better fit.
_APPEARANCE_GENERIC = 0x0000


def _adv_payload(name):
    """Connectable adv payload: Flags + Appearance + Complete Local Name.

    iOS and recent Android scanners often hide or de-prioritise devices
    that don't declare an Appearance, so we always include one. Total
    payload stays under the 31-byte cap for typical badge names — we
    truncate the name itself if needed and rely on the scan response
    to carry the full string."""
    name_bytes = name.encode("utf-8")
    # 2-byte appearance (LE)
    appearance = bytes((3, _AD_APPEARANCE,
                        _APPEARANCE_GENERIC & 0xFF,
                        (_APPEARANCE_GENERIC >> 8) & 0xFF))
    # Truncate name so Flags(3) + Appearance(4) + NameHdr(2) + name <= 31.
    max_name = 31 - 3 - 4 - 2
    if len(name_bytes) > max_name:
        name_bytes = name_bytes[:max_name]
    return (b"\x02\x01\x06"                              # Flags
            + appearance
            + bytes((len(name_bytes) + 1, 0x09))         # Complete Local Name
            + name_bytes)


def _scan_resp_payload(name):
    """Scan-response payload returned to active scanners. Carries the
    full untruncated name (so phones running active scans see "Oreo
    Badge" cleanly) plus the 128-bit service UUID so apps that filter
    by service can find us."""
    import bluetooth
    name_bytes = name.encode("utf-8")
    name_ad = bytes((len(name_bytes) + 1, 0x09)) + name_bytes
    # 128-bit Complete Service UUID list. Endianness is little-endian
    # on the wire (Core Spec Vol 3 Part C 18.2). The constant matches
    # the UUID registered in _register_service.
    svc_bytes = bytes(reversed(bytes(
        bluetooth.UUID("6f72656f-0000-1000-8000-00805f9b34fb"))))
    svc_ad = bytes((len(svc_bytes) + 1, 0x07)) + svc_bytes  # 0x07 = Complete 128-bit UUIDs
    return name_ad + svc_ad


def _start_advertising(ble):
    """Set the GAP name and start advertising. Default 200 ms interval
    so phones (which scan in short bursts) reliably see us within one
    scan window. Override via secrets.BT_ADV_INTERVAL_MS."""
    try:
        ble.config(gap_name=DEVICE_NAME)
    except Exception:
        pass
    interval_us = 200_000   # was 500_000 — too slow for iOS opportunistic scans
    try:
        from secrets import BT_ADV_INTERVAL_MS
        interval_us = int(BT_ADV_INTERVAL_MS) * 1000
    except Exception:
        pass
    adv  = _adv_payload(DEVICE_NAME)
    try:
        resp = _scan_resp_payload(DEVICE_NAME)
    except Exception:
        resp = None
    # Try the resp_data kwarg first; older MicroPython builds without it
    # fall back silently to adv-only.
    try:
        if resp is not None:
            ble.gap_advertise(interval_us, adv_data=adv, resp_data=resp)
        else:
            ble.gap_advertise(interval_us, adv_data=adv)
    except TypeError:
        # Build doesn't accept resp_data — keep going with adv only.
        try:
            ble.gap_advertise(interval_us, adv_data=adv)
        except Exception:
            pass
    except Exception:
        pass


# ─── IRQ dispatch + reassembly ───────────────────────────────────────────

_IRQ_CENTRAL_CONNECT     = 1
_IRQ_CENTRAL_DISCONNECT  = 2
_IRQ_GATTS_WRITE         = 3
_IRQ_SCAN_RESULT         = 5
_IRQ_SCAN_DONE           = 6
_IRQ_PERIPHERAL_CONNECT     = 7
_IRQ_PERIPHERAL_DISCONNECT  = 8
_IRQ_ENCRYPTION_UPDATE   = 28
_IRQ_GET_SECRET          = 29
_IRQ_SET_SECRET          = 30


# ── pair-flow state machine ─────────────────────────────────────────────
# Lives at module scope so the IRQ handlers can update it without an
# explicit dispatch object. Consumed by apps/bt to drive the popup state.

PAIR_IDLE        = "idle"
PAIR_CONNECTING  = "connecting"
PAIR_ENCRYPTING  = "encrypting"
PAIR_DONE        = "done"
PAIR_FAILED      = "failed"

_pair_state   = PAIR_IDLE
_pair_target  = None     # {"mac", "name", "kind", "addr_type", "addr", "conn"}
_pair_message = ""

# Security config — LE Secure Connections with Numeric Comparison.
# Both the badge (DISPLAY_YESNO IO caps) and a modern phone (also
# DISPLAY_YESNO) end up running the SMP "numeric comparison" method:
# the stack hands us a 6-digit confirmation value, the phone shows the
# same one, the user taps YES on both sides. This is the strongest
# pairing method available on consumer BLE and the only one that gives
# us a real on-badge consent prompt.
#
# Older phones / odd peers that can't negotiate Secure Connections fall
# back to legacy pairing; we keep mitm=True so the stack picks the most
# secure method available rather than silently dropping to JustWorks.
_IO_DISPLAY_YESNO       = 1
_IO_NO_INPUT_NO_OUTPUT  = 3

# Passkey-action codes the stack hands back in _IRQ_PASSKEY_ACTION.
_PASSKEY_ACTION_NONE    = 0
_PASSKEY_ACTION_INPUT   = 1     # peer-side: we'd need a keyboard
_PASSKEY_ACTION_DISP    = 2     # legacy: display passkey, peer enters
_PASSKEY_ACTION_NUMCMP  = 4     # Secure-Connections numeric comparison

_IRQ_PASSKEY_ACTION     = 31

# Inbound pair-prompt state. Populated by _IRQ_PASSKEY_ACTION and
# polled by oreoOS.pair_prompt to drive the on-screen confirmation
# overlay. Cleared by accept_pair_prompt() / reject_pair_prompt().
_pair_prompt = None      # {"conn", "action", "passkey", "name", "mac"}


class _RxState:
    """Stateful reassembler: header → payload → crc → write."""
    __slots__ = ("type_byte", "length", "buf", "crc_buf")
    def __init__(self):
        self.type_byte = None
        self.length    = None
        self.buf       = bytearray()
        self.crc_buf   = bytearray()


def _irq(event, data):
    global _conn, _rx_state, _conn_started_ms
    global _conn_addr_type, _conn_addr_bytes
    if event == _IRQ_CENTRAL_CONNECT:
        conn_handle, _addr_type, _addr = data
        # Single-connection policy: if we already have a peer, reject
        # the second one by disconnecting it immediately. MicroPython
        # is compiled with MAX_CONNECTIONS=3, but the UX we want is
        # "one badge ↔ one peer at a time" so the user doesn't get a
        # rats' nest of half-connected phones. (A true firmware change
        # would set CONFIG_BT_NIMBLE_MAX_CONNECTIONS=1, but that
        # requires recompiling the MicroPython port.)
        if _conn is not None and conn_handle != _conn:
            try:
                _get_ble().gap_disconnect(conn_handle)
                print("[bt] rejected 2nd connect handle=%d (busy with %d)" %
                      (conn_handle, _conn))
            except Exception:
                pass
            return
        _conn = conn_handle
        _rx_state = _RxState()
        # Stash addr so a successful inbound bond can be saved into the
        # bond store. Without this we'd only persist outbound (we-
        # initiated) pairs, and the user would see "phone paired" on
        # their phone but no entry in the badge's Paired list.
        _conn_addr_type  = _addr_type
        try:
            _conn_addr_bytes = bytes(_addr)
        except Exception:
            _conn_addr_bytes = None
        try:
            import time as _t
            _conn_started_ms = _t.ticks_ms()
            print("[bt] central connect handle=%d type=%d" %
                  (conn_handle, _addr_type))
        except Exception:
            _conn_started_ms = None
        # Surface the new peer in the notification panel so the user
        # knows something connected even if they're not on the BT
        # page. Best-effort: notifications module may not be importable
        # in the IRQ context on some builds, so swallow errors.
        try:
            mac = _mac_str(bytes(_addr))
            from oreoOS import notifications as _n
            _n.push("bt", "BT connected", mac, target=None)
        except Exception:
            pass
        # Stop advertising while a peer is connected. With single-
        # connection policy in force, continuing to advertise just
        # invites failed connects from other devices.
        try:
            _get_ble().gap_advertise(None)
        except Exception:
            pass
        # Try to push a larger MTU. Phones almost always request one;
        # missing this exchange has caused some stacks to drop the link
        # after the first GATT read returns an undersized ATT response.
        try:
            _get_ble().gattc_exchange_mtu(conn_handle)
        except Exception:
            # Older MicroPython builds don't expose gattc_exchange_mtu
            # from the peripheral side — silently fine, the central
            # drives MTU negotiation in that case.
            pass
    elif event == _IRQ_CENTRAL_DISCONNECT:
        try:
            import time as _t
            held = _t.ticks_diff(_t.ticks_ms(), _conn_started_ms) \
                   if _conn_started_ms else -1
            print("[bt] central disconnect held=%d ms" % held)
        except Exception:
            pass
        _conn = None
        _rx_state = None
        _conn_started_ms = None
        _conn_addr_type  = None
        _conn_addr_bytes = None
        # Restart advertising so the next peer can find us.
        try:
            _start_advertising(_get_ble())
        except Exception:
            pass
    elif event == _IRQ_GATTS_WRITE:
        conn_handle, attr_handle = data
        if attr_handle != _rx_handle:
            return
        chunk = _get_ble().gatts_read(_rx_handle)
        if chunk:
            _feed(chunk)
    elif event == _IRQ_SCAN_RESULT:
        addr_type, addr, adv_type, rssi, adv_data = data
        # Each result fires many times per device per scan window; we
        # merge into the dict so the most recent RSSI + any newly
        # discovered name wins. bytes(addr) copies out of the IRQ-scoped
        # buffer so we can keep the dict entry around.
        mac = _mac_str(bytes(addr))
        name, appearance, services, mfr_id = _parse_adv(bytes(adv_data))
        # Best-effort label when the peer suppresses its name (common
        # on iOS — and on Android in privacy mode). Cascade of
        # fallbacks: real name → manufacturer tag → MAC tail. The MAC
        # tail "device EE:FF" beats "(unknown)" because the user can
        # at least see how many distinct anonymous peers are nearby.
        if not name and mfr_id is not None:
            tag = _MFR_TAGS.get(mfr_id)
            if tag:
                name = tag + " device"
        if not name:
            tail = mac[-5:] if len(mac) >= 5 else mac
            # addr_type 1 = Random — tag it so the user knows the name
            # won't stick even after a successful association.
            if addr_type == 1:
                name = "device " + tail + " (R)"
            else:
                name = "device " + tail
        cur = _scan_results.get(mac)
        if cur is None:
            cur = {"mac":         mac,
                   "name":        name,
                   "rssi":        rssi,
                   "appearance":  appearance,
                   "services":    services,
                   "type":        _classify_appearance(appearance),
                   # Capture addr_type so start_pair() can pass the
                   # correct type to gap_connect — defaulting to 0
                   # (PUBLIC) was breaking every iPhone connection
                   # because iOS uses Random Resolvable addresses.
                   "addr_type":   addr_type,
                   "addr":        bytes(addr),
                   "mfr_id":      mfr_id}
            _scan_results[mac] = cur
        else:
            cur["rssi"]      = rssi
            cur["addr_type"] = addr_type
            cur["addr"]      = bytes(addr)
            # Names from active scan responses are usually more complete
            # than the ones in the initial adv. Prefer real names over
            # our manufacturer-tag / MAC-tail fallbacks; among real
            # names prefer the longer one.
            cur_name = cur["name"] or ""
            cur_is_fallback = (cur_name.startswith("device ") or
                               cur_name.endswith("device"))
            new_is_fallback = (name and (name.startswith("device ") or
                                         name.endswith("device")))
            if name and not new_is_fallback and (
                    cur_is_fallback or len(name) > len(cur_name)):
                cur["name"] = name
            elif name and new_is_fallback and cur_is_fallback and \
                    len(name) > len(cur_name):
                cur["name"] = name
            if appearance and not cur["appearance"]:
                cur["appearance"] = appearance
                cur["type"]       = _classify_appearance(appearance)
            if services:
                cur["services"] = services
            if mfr_id and not cur.get("mfr_id"):
                cur["mfr_id"] = mfr_id
    elif event == _IRQ_SCAN_DONE:
        global _scan_active
        _scan_active = False

    # ── outbound pair / bonding events ─────────────────────────────────
    elif event == _IRQ_PERIPHERAL_CONNECT:
        conn_handle, _addr_type, _addr = data
        if _pair_target is not None and _pair_state == PAIR_CONNECTING:
            _pair_target["conn"] = conn_handle
            _set_pair_state(PAIR_ENCRYPTING, "pairing...")
            # Kick the security handshake. On builds without gap_pair this
            # silently no-ops and we rely on the peer to drive encryption.
            try:
                _get_ble().gap_pair(conn_handle)
            except Exception:
                pass
    elif event == _IRQ_PERIPHERAL_DISCONNECT:
        conn_handle, _addr_type, _addr = data
        if _pair_target is not None and _pair_target.get("conn") == conn_handle:
            # If we got disconnected BEFORE encryption completed it's a
            # failure; AFTER it's the normal post-bond teardown.
            if _pair_state == PAIR_ENCRYPTING:
                _set_pair_state(PAIR_FAILED, "peer dropped link")
            # leave DONE / FAILED alone so the UI can read it
    elif event == _IRQ_ENCRYPTION_UPDATE:
        # data = (conn_handle, encrypted, authenticated, bonded, key_size)
        try:
            conn_handle, encrypted, _auth, bonded, _ks = data
        except (ValueError, TypeError):
            return
        if encrypted:
            if _pair_target is not None:
                # OUTBOUND pair (we initiated via start_pair). The
                # target dict already holds the friendly name / kind
                # from the scan result, so the bond record is rich.
                try:
                    from oreoOS import bonds
                    bonds.add(_pair_target["mac"],
                              _pair_target.get("name", ""),
                              _pair_target.get("kind", "other"))
                except Exception:
                    pass
                _set_pair_state(PAIR_DONE,
                                "paired" + (" + bonded" if bonded else ""))
            elif _conn_addr_bytes is not None:
                # INBOUND pair (phone initiated). We don't know the
                # peer's friendly name — we never scanned it — so the
                # bond entry gets a MAC-derived placeholder name that
                # the user can rename later. This is what fixes the
                # "phone says paired but Paired list is empty" bug.
                try:
                    from oreoOS import bonds
                    mac = _mac_str(_conn_addr_bytes)
                    bonds.add(mac, "BT peer " + mac[-5:], "other")
                    print("[bt] inbound bond saved: %s" % mac)
                except Exception as e:
                    try:
                        print("[bt] inbound bond save failed: %s" % e)
                    except Exception:
                        pass
            # Keep the link open. We used to gap_disconnect here on the
            # theory that the bond record was the thing the user wanted
            # — but to the user it read as "I tried to connect and it
            # immediately hung up." Leave the link up so the peer's
            # GATT exchange (file transfer, etc.) can proceed, and let
            # whichever side actually finishes its work close it.
        else:
            if _pair_target is not None:
                _set_pair_state(PAIR_FAILED, "encryption rejected")
    elif event == _IRQ_PASSKEY_ACTION:
        # data = (conn_handle, action, passkey)
        # Fired during inbound pairing when the SMP method needs user
        # interaction. We only handle NUMCMP (the path Secure Connections
        # takes when both sides are DISPLAY_YESNO) — for DISP we'd need
        # to render a 6-digit code and have the user type it on the
        # phone, which we can support later; for now we treat anything
        # other than NUMCMP as a silent accept so legacy pairing still
        # completes for older peers.
        try:
            conn_handle, action, passkey = data
        except (ValueError, TypeError):
            return
        if action == _PASSKEY_ACTION_NUMCMP:
            global _pair_prompt
            # Resolve a friendly name for the prompt — _scan_results is
            # keyed by MAC, but we don't actually know the MAC of an
            # inbound connection at this point. Best we can do is show
            # the conn handle alongside the number; the BT app's
            # connect notification already surfaced the MAC.
            _pair_prompt = {
                "conn":    conn_handle,
                "action":  action,
                "passkey": int(passkey),
                "name":    "BT peer",
                "mac":     "",
            }
            try:
                print("[bt] pair prompt passkey=%06d conn=%d" %
                      (int(passkey), conn_handle))
            except Exception:
                pass
        else:
            # Legacy / unsupported action — silently approve so we
            # don't strand the peer. They'll either succeed via legacy
            # JustWorks-ish fallback or the encryption update will
            # later flag failure.
            try:
                _get_ble().gap_passkey(conn_handle, action, passkey)
            except Exception:
                pass
    elif event == _IRQ_SET_SECRET:
        sec_type, key, value = data
        try:
            from oreoOS import bonds
            bonds.set_secret(sec_type, bytes(key) if key else None,
                             bytes(value) if value else None)
        except Exception:
            return False
        return True
    elif event == _IRQ_GET_SECRET:
        sec_type, index, key = data
        try:
            from oreoOS import bonds
            return bonds.get_secret(sec_type, index,
                                    bytes(key) if key else None)
        except Exception:
            return None


def _notify(status_byte):
    if _conn is None or _tx_handle is None:
        return
    try:
        _get_ble().gatts_notify(_conn, _tx_handle, status_byte)
    except Exception:
        pass


# ── transfer-progress notification (throttled) ──────────────────────────
# Emits "BT receiving 30%" notifications during a long file transfer so
# the notification panel reflects live progress. Updates fire at most
# every PROGRESS_STEP_BYTES of fresh payload to keep the LCD redraw cost
# bounded (the panel ticks the BT icon as a side effect of the push).
PROGRESS_STEP_BYTES = 64 * 1024
_last_progress_bytes = 0


def _emit_progress(received, total, type_byte):
    global _last_progress_bytes
    if total <= 0:
        return
    if received == total:
        _last_progress_bytes = 0
        return
    if (received - _last_progress_bytes) < PROGRESS_STEP_BYTES:
        return
    _last_progress_bytes = received
    pct = int((received * 100) // total)
    kind = "image" if type_byte == b"I" else \
           "text"  if type_byte == b"T" else \
           "markdown" if type_byte == b"M" else "file"
    try:
        from oreoOS import notifications as _n
        _n.push("bt",
                "Receiving %s" % kind,
                "%d%% · %d/%d KB" % (pct, received // 1024, total // 1024),
                target=None)
    except Exception:
        pass


def is_busy():
    """True iff a peer is currently connected. Used by the notif panel
    to drive the blinking BT icon while a transfer is live."""
    return _conn is not None


def disconnect_peer():
    """Force-disconnect the currently connected peer, if any. Called
    by the BT app's "Disconnect" action on a paired-but-active row."""
    if _conn is None:
        return False
    try:
        _get_ble().gap_disconnect(_conn)
        return True
    except Exception:
        return False


def is_advertising():
    """Best-effort introspection — MicroPython doesn't expose a direct
    'is advertising' getter, so we infer: BLE is active AND no peer is
    currently connected (we stop adv on connect)."""
    try:
        return bool(_get_ble().active()) and _conn is None
    except Exception:
        return False


def force_readvertise():
    """Stop + restart advertising. Used as a watchdog kick when a
    bonded peer claims it can't see us — also re-applies security
    config + service registration in case either got cleared after a
    failed connection attempt."""
    try:
        ble = _get_ble()
        if not ble.active():
            return False
        try:
            ble.gap_advertise(None)
        except Exception:
            pass
        _apply_security_config(ble)
        _register_service(ble)
        _start_advertising(ble)
        return True
    except Exception:
        return False


# ── advertising watchdog ────────────────────────────────────────────────
# A bonded phone expects the badge to be findable whenever it's nearby.
# In practice we've seen the badge stop advertising on a transient stack
# glitch (failed connect attempt, RX queue overflow, etc.) and the phone
# then just shows "paired, not connected" with no recovery. The watchdog
# is called by the OS run loop on a slow cadence and forces a re-adv any
# time we should be discoverable but apparently aren't.

_watchdog_last_ms = 0
_WATCHDOG_INTERVAL_MS = 30 * 1000


def watchdog_tick():
    """Called from the OS run loop. Cheap when nothing's wrong."""
    global _watchdog_last_ms
    try:
        import time as _t
        now = _t.ticks_ms()
    except Exception:
        return
    if _t.ticks_diff(now, _watchdog_last_ms) < _WATCHDOG_INTERVAL_MS:
        return
    _watchdog_last_ms = now
    # If BT is on AND nobody's connected, we MUST be advertising. There
    # is no way for MicroPython to tell us "advertising stopped" — the
    # only safe action is to nudge gap_advertise periodically. Cheap:
    # calling gap_advertise with a payload identical to the running one
    # is effectively a no-op inside NimBLE.
    if not is_active():
        return
    if _conn is not None:
        return
    try:
        _start_advertising(_get_ble())
    except Exception:
        pass


# ── inbound pair-confirm prompt API ─────────────────────────────────────
# Surfaces the SMP Numeric Comparison value to oreoOS.pair_prompt so it
# can render the on-screen confirmation overlay. Three calls cover the
# state machine: peek to read the live prompt, accept to confirm, reject
# to refuse.

def peek_pair_prompt():
    """Return the live pair-prompt dict, or None if no prompt is
    pending. Caller MUST NOT mutate the returned dict."""
    return _pair_prompt


def accept_pair_prompt():
    """User tapped YES on the confirm overlay. Pass our agreement back
    to the SMP layer; encryption completes asynchronously and
    _IRQ_ENCRYPTION_UPDATE fires when it's done."""
    global _pair_prompt
    p = _pair_prompt
    _pair_prompt = None
    if p is None:
        return False
    try:
        _get_ble().gap_passkey(p["conn"], p["action"], p["passkey"])
        return True
    except Exception:
        return False


def reject_pair_prompt():
    """User tapped NO. Drop the link — SMP will tear itself down once
    the connection's gone, and the peer sees an explicit refusal
    instead of a silent timeout."""
    global _pair_prompt
    p = _pair_prompt
    _pair_prompt = None
    if p is None:
        return False
    try:
        _get_ble().gap_disconnect(p["conn"])
        return True
    except Exception:
        return False


def _feed(chunk):
    """Push bytes into the active reassembler. May complete one transfer
    per call (or part of one — we resume across chunks)."""
    global _rx_state
    st = _rx_state
    if st is None:
        return

    pos = 0
    # Header phase — accumulate 5 bytes.
    if st.length is None:
        need = _HEADER_LEN - len(st.buf)
        st.buf.extend(chunk[pos:pos + need])
        pos += need
        if len(st.buf) < _HEADER_LEN:
            return
        st.type_byte = bytes(st.buf[0:1])
        st.length    = (st.buf[1] << 24) | (st.buf[2] << 16) \
                     | (st.buf[3] << 8)  |  st.buf[4]
        st.buf = bytearray()
        # Validate before consuming any payload. Accepted types are
        # exactly I (image), T (text) and M (markdown) — anything else
        # (a phone trying to push a .pdf / .docx / random binary) gets
        # an immediate BAD_TYPE wire ack AND a user-visible notification
        # so the badge surfaces the rejection on its own screen, not
        # just the sender's UI.
        if st.type_byte not in (b"I", b"T", b"M"):
            _notify(_STATUS_BAD_TYPE)
            try:
                _post_notification("rejected",
                                   None,
                                   None,
                                   title="Unsupported file",
                                   body="Only .md and .txt are accepted",
                                   kind="reject")
            except Exception:
                pass
            _rx_state = _RxState()
            return
        if st.type_byte == b"I" and st.length > IMAGE_MAX:
            _notify(_STATUS_TOO_LARGE)
            try:
                _post_notification("rejected",
                                   None,
                                   None,
                                   title="Image too large",
                                   body="Max %d KB per transfer" % (IMAGE_MAX // 1024),
                                   kind="reject")
            except Exception:
                pass
            _rx_state = _RxState()
            return
        _notify(_STATUS_START_OK)

    # Payload phase.
    remaining = st.length - len(st.buf)
    if remaining > 0:
        take = chunk[pos:pos + remaining]
        st.buf.extend(take)
        pos += len(take)
        # Progress hook — best-effort throttled notification update so
        # the user can watch a large image come in. We post at most
        # every ~64 KB of fresh data; finer granularity would spam the
        # notification panel and the SPI bus the LCD uses.
        try:
            _emit_progress(len(st.buf), st.length, st.type_byte)
        except Exception:
            pass
        if len(st.buf) < st.length:
            return

    # CRC phase.
    need = _CRC_LEN - len(st.crc_buf)
    st.crc_buf.extend(chunk[pos:pos + need])
    if len(st.crc_buf) < _CRC_LEN:
        return

    _finish(st)
    _rx_state = _RxState()


def _finish(st):
    """Validate CRC and commit the payload to disk."""
    import binascii
    expected = (st.crc_buf[0] << 24) | (st.crc_buf[1] << 16) \
             | (st.crc_buf[2] << 8)  |  st.crc_buf[3]
    actual = binascii.crc32(bytes(st.buf)) & 0xFFFFFFFF
    if actual != expected:
        _notify(_STATUS_BAD_CRC)
        return

    if st.type_byte == b"I":
        ok = _write_image(bytes(st.buf))
        kind_label = "image"
        notif_target = "gallery"
    elif st.type_byte == b"M":
        ok = _write_text(bytes(st.buf), ext="md")
        kind_label = "markdown"
        notif_target = "reader"
    else:
        ok = _write_text(bytes(st.buf), ext="txt")
        kind_label = "text"
        notif_target = "reader"
    _notify(_STATUS_DONE if ok else _STATUS_WRITE_FAIL)
    if ok:
        _post_notification(kind_label, len(st.buf), notif_target)


def _post_notification(kind_label, size_bytes, target,
                       title=None, body=None, kind="file"):
    """Push a transfer event into the OS notification ring.

    Successful transfers default to kind="file" with a "N bytes via BT"
    body. Rejections (bad type, oversize) pass an explicit title +
    body + kind="reject" so the panel can colour the entry distinctly.
    """
    try:
        from oreoOS import notifications
        if title is None:
            title = "New %s" % kind_label
        if body is None:
            body = "%d bytes via BT" % (size_bytes or 0)
        notifications.push(
            kind,
            title,
            body,
            target=target,
        )
    except Exception:
        pass


# ─── disk landing ────────────────────────────────────────────────────────

def _ensure_dir(path):
    import os
    parts = path.split("/")
    cur = ""
    for p in parts:
        cur = (cur + "/" + p) if cur else p
        try:
            os.mkdir(cur)
        except OSError:
            pass


def _ts():
    try:
        import time
        return str(time.time())
    except Exception:
        return "0"


def _sniff_image_ext(buf):
    """Best-effort magic-number sniff. Default to .bin if unknown."""
    if len(buf) >= 8 and buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(buf) >= 3 and buf[:3] == b"\xFF\xD8\xFF":
        return "jpg"
    if len(buf) >= 6 and buf[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return "bin"


def _write_image(buf):
    try:
        _ensure_dir(GALLERY_DIR)
        ext = _sniff_image_ext(buf)
        path = GALLERY_DIR + "/bt_" + _ts() + "." + ext
        with open(path, "wb") as f:
            f.write(buf)
        return True
    except Exception:
        return False


def _write_text(buf, ext="txt"):
    """Decompress (deflate / zlib) and write to documents/.

    `ext` controls the landing extension — "txt" for plain text and "md"
    for markdown payloads. Both share the same wire compression."""
    try:
        import deflate
        import io
        plain = deflate.DeflateIO(io.BytesIO(buf)).read()
    except Exception:
        # Sender may have skipped compression for tiny payloads — accept
        # as-is if it decodes as UTF-8, otherwise fail loudly.
        try:
            buf.decode("utf-8")
            plain = buf
        except Exception:
            _notify(_STATUS_DECOMPRESS_FAIL)
            return False
    try:
        _ensure_dir(DOCUMENTS_DIR)
        path = DOCUMENTS_DIR + "/bt_" + _ts() + "." + ext
        with open(path, "wb") as f:
            f.write(plain)
        return True
    except Exception:
        return False
