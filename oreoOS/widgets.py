"""Shared UI widgets used across Oreo OS apps.

Goal: every app has the same visual chrome (header bar, hint footer, panel
backgrounds) so the OS feels cohesive. Apps just call:

    from oreoOS import widgets
    widgets.draw_header(d, "SETTINGS")
    widgets.draw_hint  (d, "A=select  HOME=back")

and the look is consistent.
"""

from oreoOS import api, pixelfont
from oreoOS import theme

try:
    import time as _time
except ImportError:
    _time = None

HEADER_H = 28
HINT_H   = 16

# Forest-green header for the home screen (matches the bg image's tones).
HEADER_HOME_BG = api.rgb(46, 102,  74)

# Cached link state for the header WiFi pip. The actual `wifi.rssi()`
# call is cheap (~1 ms) but we still amortise it to keep header draws
# free of network-module syscalls on tight game loops.
_WIFI_POLL_MS    = 2000
_wifi_cache      = {"connected": False, "rssi": None, "metered": False,
                    "last_ms":   None}


def _poll_wifi():
    """Refresh the cached WiFi snapshot on a 2 s cadence. Returns the
    dict so draw_header() can render the right-aligned icon without
    poking the network module on every paint."""
    now = _time.ticks_ms() if _time else 0
    last = _wifi_cache["last_ms"]
    if last is not None and _time and \
       _time.ticks_diff(now, last) < _WIFI_POLL_MS:
        return _wifi_cache
    try:
        from oreoWare import wifi as _w
        _wifi_cache["connected"] = bool(_w.is_connected())
        try:
            _wifi_cache["rssi"] = _w.rssi() if _wifi_cache["connected"] else None
        except Exception:
            _wifi_cache["rssi"] = None
        try:
            _wifi_cache["metered"] = bool(_w.is_metered()) \
                                     if _wifi_cache["connected"] else False
        except Exception:
            _wifi_cache["metered"] = False
    except Exception:
        # WiFi module not importable — leave cache as-is.
        pass
    _wifi_cache["last_ms"] = now
    return _wifi_cache


def _draw_wifi_pip(d, x, y, w, h, state):
    """4-bar WiFi indicator. Hollow bars when disconnected, full bars
    by RSSI when associated, with a tiny "$" tucked next to a metered
    link so the user knows OTA + store won't auto-fetch on it."""
    bars     = 4
    bar_w    = 2
    gap      = 1
    block_w  = bars * bar_w + (bars - 1) * gap
    bx       = x + (w - block_w) // 2
    by_base  = y + h - 1
    rssi     = state.get("rssi")
    connected = state.get("connected")
    # Pick a fill count by RSSI thresholds; disconnected → 0.
    if not connected:
        fill = 0
    elif rssi is None:
        fill = 2
    elif rssi >= -55:
        fill = 4
    elif rssi >= -65:
        fill = 3
    elif rssi >= -75:
        fill = 2
    elif rssi >= -85:
        fill = 1
    else:
        fill = 1
    for i in range(bars):
        bh = 2 + i * 2     # ascending 2,4,6,8 px
        bx_i = bx + i * (bar_w + gap)
        if i < fill:
            d.rect(bx_i, by_base - bh, bar_w, bh, api.WHITE, fill=True)
        else:
            # Hollow outline for the empty cells so the gauge stays
            # readable even at full bars.
            d.rect(bx_i, by_base - bh, bar_w, 1, theme.MUTED, fill=True)
    # Metered marker: a tiny "$" 8 px to the left of the pip cluster.
    if connected and state.get("metered"):
        d.text("$", bx - 10, y + (h - 8) // 2, theme.GOLD, scale=1)

# Lazy-loaded title font (Pixelify Sans 16 — fits the 28-px header bar nicely).
_TITLE_FONT = None


def _title_font():
    global _TITLE_FONT
    if _TITLE_FONT is None:
        try:
            _TITLE_FONT = pixelfont.load("pixelify_16")
        except (ImportError, AttributeError):
            _TITLE_FONT = False
    return _TITLE_FONT if _TITLE_FONT else None


def draw_header(d, title, color=None, accent=None):
    """App header bar with a centred Pixelify Sans title.

    color  : header bg colour (default theme.STATUS_BG — crimson)
    accent : 1-px line under the header (default theme.PRIMARY)
    """
    SW = api.SCREEN_W
    bg = color  or theme.STATUS_BG
    ac = accent or theme.PRIMARY
    d.rect(0, 0, SW, HEADER_H, bg, fill=True)
    d.rect(0, HEADER_H - 1, SW, 1, ac, fill=True)

    pf = _title_font()
    if pf:
        tw = pf.measure(title)
        pf.text(d, title, (SW - tw) // 2, (HEADER_H - pf.h) // 2, api.WHITE)
    else:
        tx = (SW - len(title) * 16) // 2
        d.text(title, tx, (HEADER_H - 16) // 2, api.WHITE, scale=2)

    # Top-right WiFi pip. Polled on a 2 s cadence so this paint stays
    # cheap. Renders nothing on top of the header bg when WiFi is
    # off — the empty space reads as "no link" without an extra glyph.
    pip_w = 16
    pip_h = HEADER_H - 4
    pip_x = SW - pip_w - 6
    pip_y = 2
    _draw_wifi_pip(d, pip_x, pip_y, pip_w, pip_h, _poll_wifi())


def draw_hint(d, text, color=None):
    """Small grey hint text at the very bottom of the screen.

    Use for "press X for Y" prompts so apps don't have to handcode the bar.
    """
    SW = api.SCREEN_W
    SH = api.SCREEN_H
    y  = SH - HINT_H
    d.rect(0, y, SW, HINT_H, theme.DOCK_BG, fill=True)
    tx = (SW - len(text) * 8) // 2
    d.text(text, tx, y + 4, color or theme.TEXT_BRIGHT)


def draw_panel(d, x, y, w, h, color=None, border=True):
    """Filled panel + optional accent border. Useful for cards / dialogs."""
    fill_color = color or theme.CARD
    d.rect(x, y, w, h, fill_color, fill=True)
    if border:
        d.rect(x, y, w, 1, theme.PRIMARY, fill=True)
        d.rect(x, y + h - 1, w, 1, theme.PRIMARY, fill=True)


def play_area():
    """(x, y, w, h) of the screen region between header and hint bar."""
    SW = api.SCREEN_W
    SH = api.SCREEN_H
    return (0, HEADER_H, SW, SH - HEADER_H - HINT_H)
