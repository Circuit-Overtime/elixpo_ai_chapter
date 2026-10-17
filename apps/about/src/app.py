"""About — Oreo OS info, build metadata, and credits.

Scrollable card with: OS branding, version, build, hardware, runtime stats
(free RAM, uptime, IP), and creator credits.

Controls:
  UP/DOWN  scroll
  HOME     back to apps drawer
"""

import gc
import sys
import time

import oreoOS
from oreoOS import api, pixelfont
from oreoOS import theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H


def _load_mascot():
    try:
        m = __import__("assets.sprites.optimized.mascot", None, None, ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _kb(b):
    return "%d kB" % (b // 1024)


def _os_version():
    """Single source of truth for the OS version string lives in launcher.VERSION."""
    try:
        from oreoOS.launcher import VERSION
        return VERSION
    except Exception:
        return "v?.?.?"


class App(oreoOS.App):
    name = "About"

    def on_enter(self, os):
        super().on_enter(os)
        self._os      = os
        self._dirty   = True
        self._mascot  = _load_mascot()
        self._boot_ms = time.ticks_ms()
        self._last_s  = -1
        self._scroll  = 0
        self._max_scroll = 0
        try:
            from oreoWare import wifi
            self._ip = wifi.ip() or "—"
        except Exception:
            self._ip = "—"
        # Pixelify font cache
        try:
            self._pf_title = pixelfont.load("pixelify_24")
            self._pf_body  = pixelfont.load("pixelify_12")
        except (ImportError, AttributeError):
            self._pf_title = None
            self._pf_body  = None

    def update(self, dt):
        s = time.ticks_diff(time.ticks_ms(), self._boot_ms) // 1000
        if s != self._last_s:
            self._last_s = s
            self._dirty  = True

    def on_button_press(self, btn):
        if btn == api.BTN_UP:
            self._scroll = max(0, self._scroll - 12)
            self._dirty = True
        elif btn == api.BTN_DOWN:
            self._scroll = min(self._max_scroll, self._scroll + 12)
            self._dirty = True
        elif btn == api.BTN_A:
            # Version is the headline detail on this page — pressing A
            # opens the dedicated Updates app where the user can run
            # Check + Install. Matches the Settings → Version flow.
            try:
                self._os.launch("updates")
            except Exception:
                pass

    def _info_rows(self):
        secs = self._last_s
        # OTA status comes from the Settings → Check Update flow.
        # 'up-to-date' / 'downloading' / 'ready' / 'download-failed' / None
        ota_status = None
        try:
            ota_status = self._os.settings_get("ota_status", None)
        except Exception:
            pass
        ota_label = {
            "up-to-date":       "up to date",
            "downloading":      "downloading...",
            "ready":            "ready to install",
            "download-failed":  "fetch failed",
        }.get(ota_status, "—") if ota_status else "—"
        return [
            ("OS",       "Oreo OS"),
            ("Version",  _os_version()),
            ("Update",   ota_label),
            ("Codename", "Sweet Sandwich"),
            ("Board",    "ESP32-S3"),
            ("Memory",   _kb(gc.mem_free()) + " free"),
            ("Display",  "ST7789  320x240"),
            ("Runtime",  "MicroPython %d.%d.%d" % tuple(sys.implementation.version[:3])),
            ("IP",       self._ip[:18]),
            ("Uptime",   "%02d:%02d:%02d" % (secs // 3600,
                                            (secs % 3600) // 60,
                                             secs % 60)),
        ]

    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "ABOUT")
        widgets.draw_hint  (d, "UP/DOWN=scroll  HOME=back")

        # Scrollable content panel
        panel_x = 8
        panel_y = widgets.HEADER_H + 4
        panel_w = SW - 16
        panel_h = SH - widgets.HEADER_H - widgets.HINT_H - 8
        d.rect(panel_x, panel_y, panel_w, panel_h, theme.CARD, fill=True)
        d.rect(panel_x, panel_y, panel_w, 2, theme.PRIMARY, fill=True)

        # Inner content region with breathing-room margins so scrolling text
        # never bleeds into the pink accent at the top or hint bar below.
        PAD_TOP = 14
        PAD_BOT = 12
        content_top = panel_y + PAD_TOP
        content_bot = panel_y + panel_h - PAD_BOT

        # Clip-helper: only draw the row when its full height fits inside the
        # padded content region (no half-glyphs grazing the edges).
        def _visible(yy, h):
            return yy >= content_top and yy + h <= content_bot

        # ── content layout (drawn into "virtual" Y, then translated by scroll)
        cy_logical = 0    # logical y inside the padded content region
        draw_y     = lambda y: content_top + y - self._scroll

        # mascot + "OREO OS" — stacked, both horizontally centred in the panel.
        # Mascot on top, single-line title beneath. Replaces the old
        # side-by-side layout where OREO and OS sat on two separate lines.
        if self._mascot:
            data, mw, mh = self._mascot
            mx = panel_x + (panel_w - mw) // 2
            my = draw_y(cy_logical)
            if _visible(my, mh):
                d.blit(data, mx, my, mw, mh)
            cy_logical += mh + 8

        title = "OREO OS"
        if self._pf_title:
            tw = self._pf_title.measure(title)
            ty = draw_y(cy_logical)
            if _visible(ty, 24):
                self._pf_title.text(d, title,
                                    panel_x + (panel_w - tw) // 2,
                                    ty, theme.PRIMARY)
            cy_logical += 28
        else:
            tw = len(title) * 24             # scale=3 → 8*3 px per glyph
            ty = draw_y(cy_logical)
            if _visible(ty, 24):
                d.text(title,
                       panel_x + (panel_w - tw) // 2,
                       ty, theme.PRIMARY, scale=3)
            cy_logical += 32

        cy_logical += 6     # gap before info rows

        # ── info rows
        for label, value in self._info_rows():
            yy = draw_y(cy_logical)
            if _visible(yy, 10):
                d.text(label, panel_x + 16, yy, theme.MUTED)
                d.text(str(value), panel_x + 100, yy, theme.TEXT_BRIGHT)
            cy_logical += 14

        cy_logical += 10

        # ── credits section
        sep_y = draw_y(cy_logical)
        if _visible(sep_y, 1):
            d.rect(panel_x + 16, sep_y, panel_w - 32, 1, theme.PRIMARY, fill=True)
        cy_logical += 8

        for line, col, scale in [
                ("Crafted by",                          theme.MUTED,       1),
                ("@Circuit-Overtime",                   theme.PRIMARY,     2),
                ("Source on GitHub at",                 theme.TEXT_DIM,    1),
                ("https://github.com/elixpo/oreo",             theme.TEAL,        1)
        ]:
            yy = draw_y(cy_logical)
            row_h = 10 * scale
            if _visible(yy, row_h):
                lw = len(line) * 8 * scale
                d.text(line, panel_x + (panel_w - lw) // 2, yy, col, scale=scale)
            cy_logical += row_h + 4


        inner_h    = panel_h - PAD_TOP - PAD_BOT
        total_need = cy_logical
        if total_need > inner_h:
            self._max_scroll = total_need - inner_h + PAD_BOT
            track_h = panel_h - 8
            thumb_h = max(16, track_h * panel_h // cy_logical)
            thumb_y = panel_y + 4 + (track_h - thumb_h) * self._scroll \
                                          // max(1, self._max_scroll)
            d.rect(panel_x + panel_w - 4, panel_y + 4, 2, track_h, theme.MUTED2, fill=True)
            d.rect(panel_x + panel_w - 4, thumb_y, 2, thumb_h, theme.PRIMARY, fill=True)
        else:
            self._max_scroll = 0

        self._dirty = False
