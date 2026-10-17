"""Time + NTP helpers shared by the home clock, Settings, and notif panel."""

_DAYS  = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_MONTHS = ("", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

try:
    from datetime import datetime as _DT

    def now():
        """Return (hour, minute, second, weekday_str, day, month_str, year)."""
        n = _DT.now()
        return (n.hour, n.minute, n.second,
                _DAYS[n.weekday()], n.day, _MONTHS[n.month], n.year)

except ImportError:
    import time as _t

    def now():
        t = _t.localtime()
        return (t[3], t[4], t[5], _DAYS[t[6]], t[2], _MONTHS[t[1]], t[0])


# ── NTP sync ────────────────────────────────────────────────────────────
# Shared by the boot path (one-shot at startup) AND by the manual "Sync"
# actions in the notification panel and the Settings app. Module-level
# status is the source of truth for both surfaces so they agree on what
# the last sync attempt did.

_last_sync_status = "never"     # "never" | "ok" | "no-wifi" | "failed"
_last_sync_ts     = 0           # epoch seconds of the last successful sync


def last_sync_status():
    return _last_sync_status


def last_sync_ts():
    return _last_sync_ts


# NTP epoch (1900-01-01) → MicroPython epoch (2000-01-01) offset.
# (30 years × 365 days + 7 leap days) × 86400 seconds.
_NTP_DELTA = 3155673600


def _ntp_raw(host="pool.ntp.org", port=123, timeout_s=2.5):
    """Single-shot NTP query via raw UDP with a hard socket timeout.

    Returns the Unix-2000 epoch seconds on success, or None on
    timeout / DNS failure / malformed reply. Used instead of
    `ntptime.settime()` because the stock module's recvfrom can hang
    indefinitely on this MicroPython build — the OS run loop locks up
    for tens of seconds while it waits.
    """
    try:
        import socket as _socket
    except ImportError:
        return None
    s = None
    try:
        addr = _socket.getaddrinfo(host, port)[0][-1]
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.settimeout(timeout_s)
        # 48-byte NTP request: LI=0, VN=3, Mode=3 (client). Everything
        # else zero. The server fills in the rest in the reply.
        pkt = bytearray(48)
        pkt[0] = 0x1B
        s.sendto(pkt, addr)
        data, _src = s.recvfrom(48)
        if len(data) < 48:
            return None
        # Transmit timestamp seconds — big-endian uint32 at offset 40.
        secs = ((data[40] << 24) | (data[41] << 16)
                | (data[42] << 8) |  data[43])
        return secs - _NTP_DELTA
    except Exception:
        return None
    finally:
        try:
            if s is not None:
                s.close()
        except Exception:
            pass


def sync_from_ntp(timezone_offset_h=None):
    """Pull NTP time once, shift by the user's timezone offset, and write
    the RTC. Returns (ok, message).

    Uses a raw UDP socket with a 2.5 s settimeout so the OS run loop
    can never block longer than that — bypasses MicroPython's stock
    ntptime, whose recvfrom doesn't honour timeouts on this build.
    """
    global _last_sync_status, _last_sync_ts

    try:
        from oreoWare import wifi
        if not wifi.is_connected():
            _last_sync_status = "no-wifi"
            return False, "no wifi"
    except Exception:
        pass

    epoch_2000 = _ntp_raw()
    if epoch_2000 is None:
        _last_sync_status = "failed"
        return False, "ntp timeout"

    try:
        import machine
        import time as _t

        # Write the RTC in UTC first, then optionally shift by the
        # user's timezone offset so localtime() reads correctly.
        utc = _t.localtime(epoch_2000)
        machine.RTC().datetime(
            (utc[0], utc[1], utc[2], utc[6] + 1,
             utc[3], utc[4], utc[5], 0))

        if timezone_offset_h is None:
            try:
                from oreoOS.config import TIMEZONE_OFFSET as _TZ
                timezone_offset_h = _TZ
            except Exception:
                timezone_offset_h = 0

        if timezone_offset_h:
            shifted = _t.localtime(_t.time() + int(timezone_offset_h * 3600))
            machine.RTC().datetime(
                (shifted[0], shifted[1], shifted[2], shifted[6] + 1,
                 shifted[3], shifted[4], shifted[5], 0))

        _last_sync_ts     = _t.time()
        _last_sync_status = "ok"
        return True, "synced"
    except Exception as e:
        _last_sync_status = "failed"
        return False, (str(e) or "failed")[:20]
