"""Gamepad — full-screen button-state tester.

Landscape list of every badge button, each row showing its name on the
left and ON/OFF on the right. Held buttons light up green (with white
text); idle rows are a dim slate so the live state reads at a glance.

A short-lived gold flash overlays each row on the rising edge so you
can see brief presses that wouldn't otherwise leave the row green long
enough to notice.

HOME button:
  • Single tap registers like any other (does NOT exit).
  • Double tap within 400 ms returns to the apps drawer.
"""

import time
import oreoOS
from oreoOS import api, theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

DOUBLE_TAP_MS = 400
FLASH_MS      = 180


# Colour palette tuned to read on the badge LCD. The "off" row uses a
# slate-grey card so the green "on" stripe pops.
ROW_OFF_BG   = api.rgb( 56,  62,  78)
ROW_OFF_TXT  = api.rgb(190, 196, 210)
ROW_ON_BG    = theme.GREEN
ROW_ON_TXT   = api.WHITE
ROW_FLASH_BG = theme.GOLD
HEADER_BG    = api.rgb( 30,  34,  46)


class App(oreoOS.App):
    name = "Gamepad"

    def on_enter(self, os):
        self._os         = os
        self._held       = {b: False for b, _ in self._labels()}
        self._counts     = {b: 0     for b, _ in self._labels()}
        self._flash      = {b: 0     for b, _ in self._labels()}
        self._home_t     = -10000
        self._home_hint  = ""
        self._dirty      = True

    @staticmethod
    def _labels():
        return [
            (api.BTN_HOME,  "HOME"),
            (api.BTN_A,     "A"),
            (api.BTN_B,     "B"),
            (api.BTN_C,     "C"),
            (api.BTN_UP,    "UP"),
            (api.BTN_DOWN,  "DOWN"),
            (api.BTN_LEFT,  "LEFT"),
            (api.BTN_RIGHT, "RIGHT"),
        ]

    def on_home_press(self):
        """Double-tap HOME to leave; first tap is consumed as a button event."""
        now = time.ticks_ms()
        if time.ticks_diff(now, self._home_t) < DOUBLE_TAP_MS:
            return False
        self._home_t                = now
        self._counts[api.BTN_HOME]  = self._counts.get(api.BTN_HOME, 0) + 1
        self._flash[api.BTN_HOME]   = now + FLASH_MS
        self._home_hint             = "tap again to exit"
        self._dirty                 = True
        return True

    def on_button_press(self, btn):
        self._counts[btn] = self._counts.get(btn, 0) + 1
        self._flash[btn]  = time.ticks_ms() + FLASH_MS
        self._dirty       = True

    def on_button_release(self, btn):
        self._dirty = True

    def update(self, dt):
        btns = self._os.buttons
        now  = time.ticks_ms()
        for b, _ in self._labels():
            held = btns.is_pressed(b)
            if held != self._held[b]:
                self._held[b] = held
                self._dirty   = True
        for b in list(self._flash.keys()):
            if self._flash[b] and time.ticks_diff(now, self._flash[b]) >= 0:
                self._flash[b] = 0
                self._dirty    = True
        if self._home_hint and time.ticks_diff(now, self._home_t) > DOUBLE_TAP_MS:
            self._home_hint = ""
            self._dirty     = True

    # ── render: full-width list rows, landscape ─────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        # Solid dark backdrop covering the whole screen — the rows then sit
        # edge-to-edge with no cream border peeking through.
        d.rect(0, 0, SW, SH, HEADER_BG, fill=True)
        widgets.draw_header(d, "BUTTONS")
        widgets.draw_hint  (d, "HOME x2 = exit")

        rows     = self._labels()
        play_top = widgets.HEADER_H + 4
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H - 8
        row_h    = play_h // len(rows)
        row_gap  = 2
        cell_h   = row_h - row_gap
        text_y   = (cell_h - 16) // 2     # for scale=2 label
        sub_y    = (cell_h - 8) // 2      # for scale=1 ON/OFF

        now = time.ticks_ms()
        for i, (btn, lbl) in enumerate(rows):
            y       = play_top + i * row_h
            held    = self._held.get(btn, False)
            flash   = self._flash.get(btn, 0)
            flashing = flash and time.ticks_diff(now, flash) < 0
            if flashing:
                bg, fg = ROW_FLASH_BG, api.WHITE
            elif held:
                bg, fg = ROW_ON_BG, ROW_ON_TXT
            else:
                bg, fg = ROW_OFF_BG, ROW_OFF_TXT

            # Row card with a thin accent stripe on the left (pink when active)
            d.rect(0, y, SW, cell_h, bg, fill=True)
            d.rect(0, y, 4, cell_h, theme.PRIMARY if (held or flashing) else theme.MUTED2,
                   fill=True)

            # Label (scale=2) on the left
            d.text(lbl, 16, y + text_y, fg, scale=2)

            # ON / OFF state on the right
            state = "ON" if held else "OFF"
            sw    = len(state) * 8
            d.text(state, SW - sw - 16, y + sub_y, fg)

            # Press counter centred — only show once user has actually pressed
            cnt = self._counts.get(btn, 0)
            if cnt:
                tag = "x%d" % cnt
                tw  = len(tag) * 8
                d.text(tag, (SW - tw) // 2, y + sub_y, fg)

        # Gold home-tap hint above the hint bar
        if self._home_hint:
            d.text(self._home_hint,
                   (SW - len(self._home_hint) * 8) // 2,
                   SH - widgets.HINT_H - 12, theme.GOLD)

        self._dirty = False
