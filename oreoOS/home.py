"""Oreo OS — home screen, 320×240 landscape, celebration theme.

Layout:
  ┌─ status bar h=22 (pink bar) ───────────────────────────────┐
  │  [wifi] [bt] [bat]                              17:06       │
  ├────────────────────────────────────────────────────────────┤
  │  (home_bg asset, warm jungle/celebration bg)               │
  │                                                            │
  │          17:06       (scale=4, dark text, centred)         │
  │       Tue 12 May 2026  (centred)                           │
  │                                                            │
  ├────────────────────────────────────────────────────────────┤
  │            [APPS icon]   (cream dock, centred)             │
  └────────────────────────────────────────────────────────────┘

Nav: LEFT/RIGHT wrap, A to open.
"""

import time
from oreoOS import api
from oreoOS import theme, timeutil
import oreoOS

SW = api.SCREEN_W   # 320
SH = api.SCREEN_H   # 240

_STATUS_H   = 22
_MAIN_TOP   = _STATUS_H            # 22
_MAIN_H     = SH - _MAIN_TOP       # bg fills the rest now (no dock)

# Clock + date — vertically centred in the play area below the status bar
# and above the bottom-right APPS icon. Date uses scale=2 so it's readable.
_CLOCK_H    = 32                    # 8×8 font scale=4
_DATE_H     = 16                    # 8×8 font scale=2
_CLOCK_GAP  = 12
_BLOCK_H    = _CLOCK_H + _CLOCK_GAP + _DATE_H
_CLOCK_Y    = _MAIN_TOP + (_MAIN_H - _BLOCK_H) // 2
_DATE_Y     = _CLOCK_Y + _CLOCK_H + _CLOCK_GAP

# APPS icon (overlaid on bg, bottom-right corner — replaces the old dock)
_APPS_SZ    = 32
_APPS_MARGIN = 12
_APPS_X     = SW - _APPS_SZ - _APPS_MARGIN
_APPS_Y     = SH - _APPS_SZ - _APPS_MARGIN

# Forest-green status bar (matches the bg image's tones; the launcher app
# keeps the original crimson via the widgets default).
_HOME_STATUS_BG = api.rgb(46, 102,  74)

# ── network-status cache (module-level so it persists across Home() instances)
# Without this, every return to the home screen would re-init wifi_ok/bt_on
# to False and we'd see a brief disconnected-icon flicker until the next poll.
_NET_INTERVAL_MS = 5000          # 5 s — cron-style refresh while ANY screen is open
_net_cache = {"wifi": False, "bt": False, "checked_ms": None, "ever_checked": False}


def _poll_network():
    """Refresh the wifi/bt cache if the interval has elapsed. Cheap on miss
    (clock compare only); cheap on hit (just `isconnected()` / `active()` —
    both are non-blocking radio-state queries, not scans)."""
    import time
    now = time.ticks_ms()
    last = _net_cache["checked_ms"]
    if last is not None and time.ticks_diff(now, last) < _NET_INTERVAL_MS:
        return False
    _net_cache["checked_ms"] = now
    try:
        from oreoWare import wifi as _w, bt as _b
        _net_cache["wifi"] = bool(_w.is_connected())
        _net_cache["bt"]   = bool(_b.is_active())
    except Exception:
        pass
    _net_cache["ever_checked"] = True
    return True

# ── asset loaders (pipeline only — no procedural fallback drawing) ─────────────

_bg_cache         = None
_apps_cache       = None
_scaled_bg_cache  = None   # pre-rendered 320×240 RGB565 (big-endian) bytearray


def _load_bg():
    global _bg_cache
    if _bg_cache is not None:
        return _bg_cache if _bg_cache is not False else None
    try:
        import assets.icons.optimized.home_bg as m
        _bg_cache = (m.DATA, m.W, m.H)
        return _bg_cache
    except (ImportError, AttributeError):
        pass
    try:
        from PIL import Image
        import struct
        img = Image.open("assets/icons/raw/home_bg.png").convert("RGBA")
        img = img.resize((80, 60), Image.LANCZOS)
        bg  = Image.new("RGBA", (80, 60),
                        (theme.BG_R, theme.BG_G, theme.BG_B, 255))
        bg.paste(img, mask=img.split()[3])
        rgb = bg.convert("RGB")
        px  = rgb.load()
        words = []
        for y in range(60):
            for x in range(80):
                r, g, b = px[x, y]
                words.append(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
        data = struct.pack(">%dH" % len(words), *words)
        _bg_cache = (data, 80, 60)
        return _bg_cache
    except Exception:
        _bg_cache = False
    return None


def _get_scaled_bg():
    """Return (bytes, w, h) for the pre-scaled & dimmed home background.

    Built once on first call; cached for the lifetime of the process.
    Scaling at draw time is too slow (~100ms) and causes visible flicker.
    """
    global _scaled_bg_cache
    if _scaled_bg_cache is not None:
        return _scaled_bg_cache if _scaled_bg_cache is not False else None

    bg = _load_bg()
    if not bg:
        _scaled_bg_cache = False
        return None
    try:
        import time as _t
        _bg_start_ms = _t.ticks_ms()
        print("[home] scaled_bg precompute begin")
    except Exception:
        _bg_start_ms = None

    import struct
    data, bw, bh = bg
    SCALE = 4
    DIM   = 0.45
    sw    = bw * SCALE
    sh    = bh * SCALE
    n     = bw * bh
    words = struct.unpack(">%dH" % n, data[:n * 2])

    out  = bytearray(sw * sh * 2)
    row  = bytearray(sw * 2)

    br, bg_, bb = theme.BG_R, theme.BG_G, theme.BG_B

    for src_row in range(bh):
        base_w = src_row * bw
        for col in range(bw):
            v = words[base_w + col]
            # apply dim
            r = ((v >> 11) & 0x1F) << 3
            g = ((v >>  5) & 0x3F) << 2
            b = ( v        & 0x1F) << 3
            r = int(r + (br  - r) * DIM)
            g = int(g + (bg_ - g) * DIM)
            b = int(b + (bb  - b) * DIM)
            v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
            # big-endian bytes (high byte first) — matches framebuf convention
            b1 = v >> 8
            b0 = v & 0xFF
            base = col * SCALE * 2
            for dx in range(SCALE):
                row[base + dx * 2]     = b1
                row[base + dx * 2 + 1] = b0

        row_start = src_row * SCALE * sw * 2
        for dy in range(SCALE):
            s = row_start + dy * sw * 2
            out[s:s + sw * 2] = row

    _scaled_bg_cache = (out, sw, sh)
    try:
        if _bg_start_ms is not None:
            print("[home] scaled_bg precompute done in %d ms"
                  % _t.ticks_diff(_t.ticks_ms(), _bg_start_ms))
    except Exception:
        pass
    return _scaled_bg_cache


def _load_apps_icon():
    global _apps_cache
    if _apps_cache is not None:
        return _apps_cache if _apps_cache is not False else None
    from oreoOS.icons import load
    result = load("apps", "apps_icon.png")
    _apps_cache = result if result else False
    return result


# ── status bar icons ──────────────────────────────────────────────────────────
# Procedural fallbacks — replaced automatically when assets/status/<name>.py exists

def _load_status_icon(name):
    """Try to load a pre-baked 13×13 status icon. Returns (data,w,h) or None."""
    try:
        mod = __import__("assets.status.optimized.%s" % name,
                         None, None, ["DATA", "W", "H"])
        return (mod.DATA, mod.W, mod.H)
    except ImportError:
        return None


def _icon_wifi(d, x, y, connected=False):
    name = "wifi" if connected else "wifi_disabled"
    icon = _load_status_icon(name)
    if icon:
        d.blit(icon[0], x, y, icon[1], icon[2])
        return
    c = api.WHITE if connected else api.rgb(180, 100, 100)
    d.rect(x + 5, y + 9,  3, 2, c, fill=True)
    d.rect(x + 2, y + 6,  9, 2, c, fill=True)
    if connected:
        d.rect(x,   y + 3, 13, 2, c, fill=True)


def _icon_bt(d, x, y, active=False):
    icon = _load_status_icon("bluetooth")
    if icon:
        # Dim the icon if BT is off
        d.blit(icon[0], x, y, icon[1], icon[2])
        return
    c = api.WHITE if active else api.rgb(180, 100, 100)
    d.rect(x + 3, y,      2, 13, c, fill=True)
    d.rect(x + 5, y,      2,  2, c, fill=True)
    d.rect(x + 7, y + 2,  2,  2, c, fill=True)
    d.rect(x + 5, y + 4,  2,  2, c, fill=True)
    d.rect(x + 5, y + 7,  2,  2, c, fill=True)
    d.rect(x + 7, y + 9,  2,  2, c, fill=True)
    d.rect(x + 5, y + 11, 2,  2, c, fill=True)
    d.rect(x,     y + 3,  3,  2, c, fill=True)
    d.rect(x,     y + 8,  3,  2, c, fill=True)


def _icon_battery(d, x, y, pct=85):
    d.rect(x,      y,     20, 10, api.WHITE, fill=False)
    d.rect(x + 20, y + 3,  2,  4, api.WHITE, fill=True)
    filled = max(1, int((pct / 100) * 18))
    d.rect(x + 1,  y + 1, filled, 8, api.WHITE, fill=True)


# ── dock entry ────────────────────────────────────────────────────────────────

class _DockEntry:
    __slots__ = ("label", "action", "icon_file")
    def __init__(self, label, action, icon_file=None):
        self.label     = label
        self.action    = action
        self.icon_file = icon_file


# ── Home app ─────────────────────────────────────────────────────────────────

class Home(oreoOS.App):
    name = "home"

    def __init__(self, app_list):
        self._apps         = app_list
        self._dirty        = True   # full redraw (background + everything)
        self._clock_dirty  = False  # repaint only clock+date band
        self._status_dirty = False  # repaint only status bar
        self._last_sec     = -1
        self._blink        = True
        # Initialise from the cross-instance cache so re-entering home doesn't
        # flash the icons "disconnected" before the next 5-s poll catches up.
        self._wifi_ok      = _net_cache["wifi"]
        self._bt_on        = _net_cache["bt"]
        try:
            from oreoWare import battery
            self._battery_pct = battery.read_percent()
        except Exception:
            self._battery_pct = 85
        self._last_batt_ms = None

    def on_enter(self, os):
        super().on_enter(os)
        self._dirty = True

    def on_button_press(self, btn):
        # A always opens the apps drawer — the dock is gone, the icon
        # in the bottom-right of the bg is purely a visual hint now.
        if btn == api.BTN_A:
            self.os.launch("__appmenu__")

    def update(self, dt):
        _, _, s, *_ = timeutil.now()
        if s != self._last_sec:
            self._last_sec = s
            self._blink    = not self._blink
            # Only the clock area needs repainting on tick — NOT the full screen
            self._clock_dirty = True

        # Refresh the network cache (no-op unless _NET_INTERVAL_MS elapsed).
        if _poll_network():
            if _net_cache["wifi"] != self._wifi_ok or _net_cache["bt"] != self._bt_on:
                self._wifi_ok      = _net_cache["wifi"]
                self._bt_on        = _net_cache["bt"]
                self._status_dirty = True

        # Battery: re-sample every ~30 s. ADC reads are ~1 ms, but the
        # percentage changes slowly enough that anything more frequent is
        # noise.
        import time as _t
        now = _t.ticks_ms()
        if self._last_batt_ms is None or _t.ticks_diff(now, self._last_batt_ms) > 30000:
            self._last_batt_ms = now
            try:
                from oreoWare import battery
                new_pct = battery.read_percent()
                if new_pct != self._battery_pct:
                    self._battery_pct  = new_pct
                    self._status_dirty = True
            except Exception:
                pass

    def draw(self, d):
        full = self._dirty
        clock_only  = (not full) and getattr(self, "_clock_dirty", False)
        status_only = (not full) and getattr(self, "_status_dirty", False)
        if not (full or clock_only or status_only):
            return

        h, m, s, wd, day, mon, yr = timeutil.now()

        if full:
            try:
                import time as _t
                _draw_start = _t.ticks_ms()
                print("[home] full draw begin")
            except Exception:
                _draw_start = None
            # ── background (uses cached pre-scaled buffer) ──────────────
            sbg = _get_scaled_bg()
            if sbg:
                data, sw, sh = sbg
                d.blit(data, 0, _MAIN_TOP, sw, sh)
            else:
                d.clear(theme.BG)

            self._draw_status_bar(d, h, m)
            self._draw_clock_area(d, h, m, wd, day, mon, yr)
            self._draw_apps_icon(d)
            self._dirty = False
            self._clock_dirty = False
            self._status_dirty = False
            try:
                if _draw_start is not None:
                    print("[home] full draw done in %d ms"
                          % _t.ticks_diff(_t.ticks_ms(), _draw_start))
            except Exception:
                pass
            return

        if clock_only:
            # Clear ONLY the clock+date area, then redraw
            self._draw_clock_area(d, h, m, wd, day, mon, yr)
            self._clock_dirty = False

        if status_only:
            self._draw_status_bar(d, h, m)
            self._status_dirty = False

    def _draw_status_bar(self, d, h, m):
        # Forest-green to match the bg image's foliage; thin pink accent line.
        d.rect(0, 0, SW, _STATUS_H, _HOME_STATUS_BG, fill=True)
        d.rect(0, _STATUS_H - 1, SW, 1, theme.PRIMARY, fill=True)
        d.text("%02d:%02d" % (h, m), 6, 7, api.WHITE)

        # Right-anchored cluster aligned to a single baseline. Layout (R→L):
        #   [WiFi 13px] [4px] [BT 13px] [4px] [PCT text] [4px] [BAT 22px]   right edge=6px
        # All icons start at y=4 (top of cluster) so they share a baseline;
        # the battery icon is 10 px tall and the text is 8 px so we centre
        # them visually using y=6 for the battery body and y=7 for the text.
        right_pad = 6
        bat_w     = 22
        icon_w    = 13
        gap       = 4

        pct_str = "%d%%" % self._battery_pct
        text_w  = len(pct_str) * 8

        bat_x   = SW - right_pad - bat_w
        pct_x   = bat_x - gap - text_w
        bt_x    = pct_x - gap - icon_w
        wifi_x  = bt_x  - gap - icon_w

        icon_y = (_STATUS_H - icon_w) // 2     # vertical-centre 13-px icon
        text_y = (_STATUS_H - 8) // 2          # vertical-centre 8-px text

        _icon_wifi   (d, wifi_x, icon_y, connected=self._wifi_ok)
        _icon_bt     (d, bt_x,   icon_y, active=self._bt_on)
        d.text(pct_str, pct_x, text_y, api.WHITE)
        _icon_battery(d, bat_x, (_STATUS_H - 10) // 2, pct=self._battery_pct)
        _icon_wifi (d, pct_x - 32, 5, connected=self._wifi_ok)

    def _draw_clock_area(self, d, h, m, wd, day, mon, yr):
        # Repaint just the clock band over the (cached) background.
        # We re-blit the relevant slice of the cached scaled bg as our "erase".
        sbg = _get_scaled_bg()
        if sbg:
            data, sw, sh = sbg
            # Slice rows _CLOCK_Y..(_DATE_Y+8) from the cached bg
            slice_y = _CLOCK_Y - _MAIN_TOP
            slice_h = (_DATE_Y + 8) - _CLOCK_Y
            row_bytes = sw * 2
            start = slice_y * row_bytes
            end   = start + slice_h * row_bytes
            d.blit(data[start:end], 0, _CLOCK_Y, sw, slice_h)
        else:
            d.rect(0, _CLOCK_Y, SW, (_DATE_Y + 8) - _CLOCK_Y, theme.BG, fill=True)

        char_w  = 8 * 4
        total_w = 5 * char_w
        cx      = (SW - total_w) // 2
        colon_c = theme.TEXT_BRIGHT if self._blink else theme.MUTED
        d.text("%02d" % h, cx,              _CLOCK_Y, theme.TEXT_BRIGHT, scale=4)
        d.text(":",        cx + 2 * char_w, _CLOCK_Y, colon_c,           scale=4)
        d.text("%02d" % m, cx + 3 * char_w, _CLOCK_Y, theme.TEXT_BRIGHT, scale=4)

        date_str = "%s %d %s %d" % (wd, day, mon, yr)
        # Bigger date (scale=2) for legibility; centred horizontally.
        dx = max(0, (SW - len(date_str) * 16) // 2)
        d.text(date_str, dx, _DATE_Y, theme.TEXT_BRIGHT, scale=2)

    def _draw_apps_icon(self, d):
        """Overlay the APPS icon in the bottom-right corner of the bg — no dock.
        Pressing A always opens the apps drawer; the icon is a visual cue only.
        """
        icon = _load_apps_icon()
        ix, iy = _APPS_X, _APPS_Y
        if icon:
            idata, iw, ih = icon
            # Centre the actual icon inside the _APPS_SZ box (handles smaller icons)
            d.blit(idata,
                   ix + (_APPS_SZ - iw) // 2,
                   iy + (_APPS_SZ - ih) // 2,
                   iw, ih)
        else:
            _draw_grid_fallback(d, ix + 2, iy + 2, _APPS_SZ - 4)


def _draw_grid_fallback(d, x, y, size):
    """3×3 squares — shown only until apps_icon.png is generated & optimised."""
    cell = (size - 4) // 3
    gap  = 2
    cols = [theme.PRIMARY, theme.TEAL,  theme.GOLD,
            theme.TEAL,    theme.ORANGE, theme.PRIMARY,
            theme.GOLD,    theme.PRIMARY, theme.PURPLE]
    i = 0
    for row in range(3):
        for col in range(3):
            d.rect(x + col * (cell + gap), y + row * (cell + gap),
                   cell, cell, cols[i % len(cols)], fill=True)
            i += 1
