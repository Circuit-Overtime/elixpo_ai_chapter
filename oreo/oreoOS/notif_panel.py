"""OS-level notification panel.

A single instance lives on the OS object (`os._notif_panel`). The run
loop in launcher.py intercepts BTN_C globally, calls `toggle()`, and
while `is_active()` is True routes all subsequent input through the
panel rather than the running app.

Layout (slides down from the top, full width):

  pink header strip  ── bell + "NOTIFICATIONS"
  quick-toggle row   ── three chunky pills:  WiFi  •  BT  •  Settings
  brightness row     ── wide range slider with live %
  notif card list    ── one per push, newest first
  hint band          ── A=open  B=clear  C/HOME=close

Focus model:
  _focus == "quick"   LEFT/RIGHT cycles pills, A activates,
                      DOWN drops to "bright"
  _focus == "bright"  LEFT/RIGHT adjusts ±10 %, UP back to "quick",
                      DOWN drops to "list" (if non-empty)
  _focus == "list"    UP/DOWN walks cards, A opens target, B clears all,
                      UP at top → "bright"

Quick settings are wired directly into oreoWare modules — `bt.set_active`,
`wifi.connect_from_config`/`wifi.disconnect`, `display.set_brightness`.
The Settings pill closes the panel and launches the Settings app.
The panel never blocks for I/O; toggles fire and the panel re-renders
the new state next frame.
"""

import time
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

_ANIM_DUR = 0.18      # slide-in duration (seconds)

# Quick-settings pill geometry.
_PILL_W   = (SW - 4 * 12) // 3      # three pills with 12 px gaps
_PILL_H   = 38
_PILL_PAD = 12
_PILL_Y   = 26

_BRIGHT_Y    = _PILL_Y + _PILL_H + 8
_BRIGHT_H    = 22
_BRIGHT_PAD  = 12
_BRIGHT_STEP = 10               # ± per LEFT/RIGHT tap on the slider
_BRIGHT_MIN  = 10               # don't let users blank the screen accidentally
_BRIGHT_MAX  = 100

_TIME_Y      = _BRIGHT_Y + _BRIGHT_H + 6
_TIME_H      = 20
_TIME_PAD    = 12

_CARD_H   = 34
_CARD_GAP = 4
_LIST_Y   = _TIME_Y + _TIME_H + 8


def _draw_bell(d, x, y, color):
    """Tiny hand-bell beside the panel title."""
    d.rect(x + 4, y,     4, 1, color, fill=True)
    d.rect(x + 3, y + 1, 6, 1, color, fill=True)
    d.rect(x + 2, y + 2, 8, 1, color, fill=True)
    d.rect(x + 2, y + 3, 8, 1, color, fill=True)
    d.rect(x + 2, y + 4, 8, 1, color, fill=True)
    d.rect(x + 1, y + 5, 10, 1, color, fill=True)
    d.rect(x + 5, y + 7, 2, 2, color, fill=True)


def _draw_gear(d, x, y, color):
    """12×12 gear glyph for the Settings quick-action pill."""
    # outer teeth — four nubs at N/S/E/W
    d.rect(x + 5, y,      2, 2, color, fill=True)
    d.rect(x + 5, y + 10, 2, 2, color, fill=True)
    d.rect(x,     y + 5,  2, 2, color, fill=True)
    d.rect(x + 10, y + 5, 2, 2, color, fill=True)
    # body
    d.rect(x + 3, y + 2, 6, 8, color, fill=True)
    d.rect(x + 2, y + 3, 8, 6, color, fill=True)
    # hub punch-out (background)
    d.rect(x + 5, y + 5, 2, 2, theme.CARD, fill=True)


def _draw_clock(d, x, y, color):
    """12×12 clock-face glyph for the time-sync row."""
    d.rect(x + 2, y,     8, 1, color, fill=True)
    d.rect(x + 2, y + 11, 8, 1, color, fill=True)
    d.rect(x,     y + 2, 1, 8, color, fill=True)
    d.rect(x + 11, y + 2, 1, 8, color, fill=True)
    d.rect(x + 1, y + 1, 1, 1, color, fill=True)
    d.rect(x + 10, y + 1, 1, 1, color, fill=True)
    d.rect(x + 1, y + 10, 1, 1, color, fill=True)
    d.rect(x + 10, y + 10, 1, 1, color, fill=True)
    # hands (12 + 3 o'clock)
    d.rect(x + 5, y + 3, 2, 4, color, fill=True)
    d.rect(x + 6, y + 5, 4, 2, color, fill=True)


def _draw_sun(d, x, y, color):
    """12×12 sun glyph for the brightness slider label."""
    d.rect(x + 5, y,      2, 2, color, fill=True)
    d.rect(x + 5, y + 10, 2, 2, color, fill=True)
    d.rect(x,     y + 5,  2, 2, color, fill=True)
    d.rect(x + 10, y + 5, 2, 2, color, fill=True)
    d.rect(x + 1, y + 1, 2, 2, color, fill=True)
    d.rect(x + 9, y + 1, 2, 2, color, fill=True)
    d.rect(x + 1, y + 9, 2, 2, color, fill=True)
    d.rect(x + 9, y + 9, 2, 2, color, fill=True)
    d.rect(x + 4, y + 3, 4, 6, color, fill=True)
    d.rect(x + 3, y + 4, 6, 4, color, fill=True)


def _draw_kind_glyph(d, x, y, kind, ink):
    """12×12 per-kind notification glyph (file / ota / reject / other)."""
    if kind == "reject":
        # Crossed-circle "no" symbol — diagonal slash inside a hollow O.
        # Used for BT-rejected transfers (wrong file type, oversize image)
        # so the user can tell at a glance the notif is bad-news, not
        # a fresh delivery.
        d.rect(x + 3, y,     6, 1, ink, fill=True)
        d.rect(x + 3, y + 11, 6, 1, ink, fill=True)
        d.rect(x,     y + 3, 1, 6, ink, fill=True)
        d.rect(x + 11, y + 3, 1, 6, ink, fill=True)
        d.rect(x + 1, y + 1, 2, 2, ink, fill=True)
        d.rect(x + 9, y + 1, 2, 2, ink, fill=True)
        d.rect(x + 1, y + 9, 2, 2, ink, fill=True)
        d.rect(x + 9, y + 9, 2, 2, ink, fill=True)
        # diagonal slash
        for i in range(8):
            d.rect(x + 2 + i, y + 9 - i, 1, 1, ink, fill=True)
        return
    if kind == "file":
        d.rect(x + 1, y,     8, 12, ink, fill=False)
        d.rect(x + 1, y,     8, 1,  ink, fill=True)
        d.rect(x + 1, y + 11, 8, 1, ink, fill=True)
        d.rect(x + 1, y, 1, 12, ink, fill=True)
        d.rect(x + 8, y, 1, 12, ink, fill=True)
        d.rect(x + 6, y,     3, 1, ink, fill=True)
        d.rect(x + 7, y + 1, 2, 1, ink, fill=True)
        d.rect(x + 8, y + 2, 1, 1, ink, fill=True)
        d.rect(x + 3, y + 4, 4, 1, ink, fill=True)
        d.rect(x + 3, y + 7, 4, 1, ink, fill=True)
    elif kind == "ota":
        d.rect(x + 4, y,     2, 7, ink, fill=True)
        d.rect(x + 2, y + 6, 6, 1, ink, fill=True)
        d.rect(x + 3, y + 7, 4, 1, ink, fill=True)
        d.rect(x + 4, y + 8, 2, 1, ink, fill=True)
        d.rect(x + 1, y + 10, 1, 2, ink, fill=True)
        d.rect(x + 8, y + 10, 1, 2, ink, fill=True)
        d.rect(x + 1, y + 11, 8, 1, ink, fill=True)
    else:
        d.rect(x + 4, y + 1, 2, 2, ink, fill=True)
        d.rect(x + 1, y + 4, 8, 2, ink, fill=True)
        d.rect(x + 4, y + 7, 2, 2, ink, fill=True)
        d.rect(x + 3, y + 9, 4, 1, ink, fill=True)


class NotifPanel:
    """Drawn over the running app when active. The run loop calls
    `tick(dt)` → `handle_button(b)` (returns True when consumed) →
    `draw(d)` from inside its frame loop."""

    def __init__(self, os_obj):
        self._os    = os_obj
        self.open   = False        # logical state (independent of anim)
        self._t     = 0.0          # animation progress 0..1
        self._dir   = 0            # +1 opening, -1 closing
        self._focus = "quick"      # "quick" | "bright" | "time" | "list"
        self._quick_sel = 0
        self._list_sel  = 0
        # Transient toast shown in the time-sync row while a manual sync
        # is in flight, then for ~1.5 s after it finishes. None = display
        # the live clock instead. (start_ms, text, color_key)
        self._time_toast = None
        self._toast_ms   = 1500

    # ── visibility ──────────────────────────────────────────────────────
    def is_active(self):
        """True while the panel is on-screen — used by the run loop to
        suppress app input + force a frame redraw every tick."""
        return self.open or self._t > 0

    def toggle(self):
        if self.open:
            self._dir = -1
        else:
            self.open = True
            self._dir = 1
            self._focus = "quick"
            self._quick_sel = 0
            self._list_sel  = 0
            self._mark_read()

    def close(self):
        if self.open:
            self._dir = -1

    def _mark_read(self):
        try:
            from oreoOS import notifications
            notifications.mark_read()
        except Exception:
            pass

    # ── per-frame ───────────────────────────────────────────────────────
    def tick(self, dt):
        if self._dir == 0:
            return
        self._t += self._dir * (dt / _ANIM_DUR)
        if self._t >= 1.0:
            self._t   = 1.0
            self._dir = 0
        elif self._t <= 0.0:
            self._t    = 0.0
            self._dir  = 0
            self.open  = False

    # ── input ───────────────────────────────────────────────────────────
    def handle_button(self, btn):
        """Returns True if the panel consumed the button; the run loop
        skips app dispatch in that case."""
        if not self.open:
            return False

        if btn == api.BTN_C or btn == api.BTN_HOME:
            self.close()
            return True

        items = self._items()
        if self._focus == "quick":
            return self._handle_quick(btn, items)
        if self._focus == "bright":
            return self._handle_bright(btn, items)
        if self._focus == "time":
            return self._handle_time(btn, items)
        return self._handle_list(btn, items)

    def _handle_quick(self, btn, items):
        if btn == api.BTN_LEFT:
            self._quick_sel = (self._quick_sel - 1) % 3
        elif btn == api.BTN_RIGHT:
            self._quick_sel = (self._quick_sel + 1) % 3
        elif btn == api.BTN_DOWN:
            self._focus = "bright"
        elif btn == api.BTN_A:
            if self._quick_sel == 0:
                self._toggle_wifi()
            elif self._quick_sel == 1:
                self._toggle_bt()
            else:
                self._open_settings()
        else:
            return True
        return True

    def _handle_bright(self, btn, items):
        if btn == api.BTN_LEFT:
            self._adjust_brightness(-_BRIGHT_STEP)
        elif btn == api.BTN_RIGHT:
            self._adjust_brightness(+_BRIGHT_STEP)
        elif btn == api.BTN_UP:
            self._focus = "quick"
        elif btn == api.BTN_DOWN:
            self._focus = "time"
        return True

    def _handle_time(self, btn, items):
        if btn == api.BTN_A:
            self._sync_time()
        elif btn == api.BTN_UP:
            self._focus = "bright"
        elif btn == api.BTN_DOWN:
            if items:
                self._focus = "list"
                self._list_sel = 0
        return True

    def _handle_list(self, btn, items):
        n = len(items)
        if btn == api.BTN_UP:
            if self._list_sel == 0:
                self._focus = "time"
            else:
                self._list_sel -= 1
        elif btn == api.BTN_DOWN:
            self._list_sel = min(n - 1, self._list_sel + 1)
        elif btn == api.BTN_A and n:
            target = items[self._list_sel].get("target")
            try:
                from oreoOS import notifications
                notifications.remove_at(self._list_sel)
            except Exception:
                pass
            self.open = False
            self._t   = 0.0
            self._dir = 0
            if target:
                self._os.launch(target)
        elif btn == api.BTN_B:
            try:
                from oreoOS import notifications
                notifications.clear()
            except Exception:
                pass
            self._list_sel = 0
            self._focus    = "quick"
        return True

    # ── quick-setting actions ───────────────────────────────────────────
    def _toggle_wifi(self):
        """Drive the WiFi RADIO state, not the association state.

        The old behaviour was: "if connected → disconnect; else →
        connect_from_config". That made the chip look like a no-op
        any time auto-association failed: tap → radio up → can't
        associate → is_connected() stays False → chip still reads
        "OFF" → next tap thinks it's currently off and tries the same
        thing again. Now the chip tracks radio_on(): one tap powers
        the MAC up (and *tries* to associate), another tap powers it
        fully down. Association status surfaces as the sub-label.
        """
        try:
            from oreoWare import wifi
            on_now = False
            try:
                on_now = bool(wifi.is_radio_on())
            except Exception:
                # Old build without is_radio_on — fall back to the
                # association check (no worse than before).
                on_now = bool(wifi.is_connected())
            if on_now:
                wifi.radio_off() if hasattr(wifi, "radio_off") else wifi.disconnect()
            else:
                if hasattr(wifi, "radio_on"):
                    wifi.radio_on()
                # Commit the visible ON state before association blocks in
                # connect_from_config(). This makes the single button press
                # acknowledge immediately even when no saved AP is reachable.
                try:
                    self.draw(self._os.display)
                    self._os.display.present()
                except Exception:
                    pass
                # Pump button input through the wait so the panel can
                # still react if the user changes their mind. Older
                # wifi.py without pump_cb support falls through to the
                # plain blocking call.
                try:
                    wifi.connect_from_config(pump_cb=self._wifi_cancel_pump)
                except TypeError:
                    wifi.connect_from_config()
        except Exception:
            pass

    def _wifi_cancel_pump(self):
        """Called from inside wifi.connect_from_config's wait loop.
        Returns True on any keypress so the user can cancel the
        in-flight 'searching…' attempt without waiting for the
        per-network timeout."""
        try:
            self._os.buttons.update()
            for b_ in api.BUTTONS:
                if self._os.buttons.just_pressed(b_):
                    return True
        except Exception:
            pass
        return False

    def _toggle_bt(self):
        try:
            from oreoWare import bt
            bt.set_active(not bt.is_active())
        except Exception:
            pass

    def _adjust_brightness(self, delta):
        cur = getattr(self._os, "_last_brightness", 100)
        nxt = max(_BRIGHT_MIN, min(_BRIGHT_MAX, cur + delta))
        if nxt == cur:
            return
        try:
            self._os.display.set_brightness(nxt)
            self._os._last_brightness = nxt
        except Exception:
            pass

    def _sync_time(self):
        # ~2 s blocking call. We post a "syncing…" toast first so the
        # next frame can paint it before we vanish into the network
        # round-trip; the result toast appears on the frame after.
        self._time_toast = (time.ticks_ms(), "syncing…", "muted")
        try:
            from oreoOS import timeutil
            ok, msg = timeutil.sync_from_ntp()
        except Exception:
            ok, msg = False, "failed"
        key = "ok" if ok else "err"
        self._time_toast = (time.ticks_ms(), msg, key)

    def _open_settings(self):
        # Close the panel synchronously and hand control to Settings —
        # one-tap shortcut so users can dive deeper without leaving the
        # current app, scrolling for the Settings tile, then coming back.
        self.open = False
        self._t   = 0.0
        self._dir = 0
        try:
            self._os.launch("settings")
        except Exception:
            pass

    # ── data ────────────────────────────────────────────────────────────
    def _items(self):
        try:
            from oreoOS import notifications
            return notifications.items()
        except Exception:
            return []

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if self._t <= 0:
            return
        items   = self._items()
        full_h  = SH - widgets.HINT_H
        offset  = int(full_h * (1.0 - self._t))
        panel_y = -offset

        # Backdrop
        d.rect(0, panel_y, SW, full_h, theme.DOCK_BG, fill=True)
        d.rect(0, panel_y + full_h - 2, SW, 2, theme.PRIMARY, fill=True)

        # Header
        title    = "NOTIFICATIONS"
        title_w  = len(title) * 8
        title_x  = (SW - title_w) // 2
        d.rect(0, panel_y, SW, 22, theme.PRIMARY, fill=True)
        d.text(title, title_x, panel_y + 7, theme.BG, scale=1)
        _draw_bell(d, title_x - 16, panel_y + 4, theme.BG)

        self._draw_quick_row(d, panel_y)
        self._draw_brightness(d, panel_y)
        self._draw_time_row(d, panel_y)
        self._draw_list(d, panel_y, items, full_h)
        self._draw_hint(d, panel_y, full_h)

    def _draw_quick_row(self, d, panel_y):
        # Three pills: WiFi / BT / Settings (shortcut, never "on").
        labels = ("WiFi", "BT", "Settings")
        states = self._quick_states()
        for i in range(3):
            x = _PILL_PAD + i * (_PILL_W + _PILL_PAD)
            y = panel_y + _PILL_Y
            on = states[i]["on"]
            sel = (self._focus == "quick" and self._quick_sel == i)
            fill = theme.PRIMARY if on else theme.CARD
            d.rect(x, y, _PILL_W, _PILL_H, fill, fill=True)
            if sel:
                d.rect(x,         y,             _PILL_W, 1,        theme.SEL_BORDER, fill=True)
                d.rect(x,         y + _PILL_H-1, _PILL_W, 1,        theme.SEL_BORDER, fill=True)
                d.rect(x,         y,             1,       _PILL_H,  theme.SEL_BORDER, fill=True)
                d.rect(x+_PILL_W-1, y,           1,       _PILL_H,  theme.SEL_BORDER, fill=True)
            txt_color = theme.BG if on else theme.TEXT_BRIGHT
            label = labels[i]

            if i == 2:
                # Settings pill — gear glyph + "Settings" + "open ›" sub
                _draw_gear(d, x + 8, y + 6, txt_color)
                d.text(label, x + 22, y + 6, txt_color, scale=1)
                sub = "open ›"
                d.text(sub, x + (_PILL_W - len(sub) * 8) // 2,
                       y + 22, txt_color, scale=1)
            else:
                d.text(label, x + (_PILL_W - len(label) * 8) // 2,
                       y + 6, txt_color, scale=1)
                sub = states[i]["sub"]
                d.text(sub, x + (_PILL_W - len(sub) * 8) // 2,
                       y + 22, txt_color, scale=1)

    def _quick_states(self):
        out = [
            {"on": False, "sub": "off"},
            {"on": False, "sub": "off"},
            {"on": False, "sub": ""},      # Settings shortcut — stateless
        ]
        try:
            from oreoWare import wifi
            connected = False
            radio_on = False
            try:
                connected = bool(wifi.is_connected())
            except Exception:
                pass
            try:
                radio_on = bool(wifi.is_radio_on())
            except Exception:
                radio_on = connected
            out[0]["on"] = radio_on
            if connected:
                cur = ""
                try: cur = wifi.ssid() or ""
                except Exception: pass
                out[0]["sub"] = (cur[:10] if cur else "on")
            elif radio_on:
                out[0]["sub"] = "no link"
            else:
                out[0]["sub"] = "off"
        except Exception:
            pass
        try:
            from oreoWare import bt
            active = bt.is_active()
            out[1]["on"]  = bool(active)
            # Blink "transferring" while a peer is connected. The panel
            # samples this dict every frame the panel is open, so just
            # alternating the sublabel is enough to make the BT chip
            # visibly pulse without a dedicated animator. ticks_ms / 500
            # gives a ~2 Hz cadence.
            try:
                busy = bt.is_busy()
            except Exception:
                busy = False
            if busy:
                try:
                    import time as _t
                    phase = (_t.ticks_ms() // 500) & 1
                except Exception:
                    phase = 0
                out[1]["sub"] = "transfer…" if phase else "transferring"
            else:
                out[1]["sub"] = "on" if active else "off"
        except Exception:
            pass
        return out

    def _draw_brightness(self, d, panel_y):
        """Wide horizontal range slider showing current backlight level."""
        x = _BRIGHT_PAD
        y = panel_y + _BRIGHT_Y
        w = SW - 2 * _BRIGHT_PAD
        h = _BRIGHT_H

        sel = (self._focus == "bright")
        d.rect(x, y, w, h, theme.CARD, fill=True)
        if sel:
            d.rect(x,         y,         w, 1, theme.SEL_BORDER, fill=True)
            d.rect(x,         y + h - 1, w, 1, theme.SEL_BORDER, fill=True)
            d.rect(x,         y,         1, h, theme.SEL_BORDER, fill=True)
            d.rect(x + w - 1, y,         1, h, theme.SEL_BORDER, fill=True)

        _draw_sun(d, x + 6, y + (h - 12) // 2, theme.PRIMARY)

        bright = getattr(self._os, "_last_brightness", 100)
        bright = max(_BRIGHT_MIN, min(_BRIGHT_MAX, int(bright)))

        # Slider track + fill — track is the full inner width, fill
        # proportional to the brightness value. Track sits centre-vertical
        # of the pill so the sun + value sit beside it.
        track_x = x + 24
        track_w = w - 24 - 44
        track_y = y + (h - 4) // 2
        d.rect(track_x, track_y, track_w, 4, theme.MUTED2, fill=True)

        fill_w = max(2, (track_w * bright) // _BRIGHT_MAX)
        d.rect(track_x, track_y, fill_w, 4, theme.PRIMARY, fill=True)

        # Handle dot — small square at the fill end so it's obvious which
        # direction LEFT/RIGHT moves the value.
        handle_x = track_x + fill_w - 3
        d.rect(handle_x, track_y - 3, 6, 10, theme.PRIMARY, fill=True)

        # Value tag on the right edge.
        val = "%d%%" % bright
        d.text(val, x + w - len(val) * 8 - 8,
               y + (h - 8) // 2, theme.TEXT_BRIGHT, scale=1)

    def _draw_list(self, d, panel_y, items, full_h):
        list_top = panel_y + _LIST_Y
        list_h   = full_h - _LIST_Y - 18    # leave room for hint

        if not items:
            msg = "no notifications"
            d.text(msg, (SW - len(msg) * 8) // 2,
                   list_top + list_h // 2 - 4, theme.MUTED, scale=1)
            return

        max_cards = max(1, list_h // (_CARD_H + _CARD_GAP))
        top = max(0, self._list_sel - max_cards + 1) if self._focus == "list" else 0
        for i in range(top, min(len(items), top + max_cards)):
            it = items[i]
            y  = list_top + (i - top) * (_CARD_H + _CARD_GAP)
            sel = (self._focus == "list" and i == self._list_sel)
            bg  = theme.DOCK_SEL if sel else theme.CARD
            d.rect(8, y, SW - 16, _CARD_H, bg, fill=True)
            if sel:
                # Simple 1-px outline; rounded version lives in launcher.
                d.rect(8,           y,            SW - 16, 1,       theme.SEL_BORDER, fill=True)
                d.rect(8,           y + _CARD_H-1, SW - 16, 1,      theme.SEL_BORDER, fill=True)
                d.rect(8,           y,            1,       _CARD_H, theme.SEL_BORDER, fill=True)
                d.rect(SW - 9,      y,            1,       _CARD_H, theme.SEL_BORDER, fill=True)
            kind = it.get("kind", "")
            ink  = (theme.GOLD if kind == "file"
                    else theme.PRIMARY if kind == "ota"
                    else theme.PRIMARY if kind == "reject"
                    else theme.TEAL)
            _draw_kind_glyph(d, 14, y + 9, kind, ink)
            title = it.get("title", "")[:24]
            body  = it.get("body",  "")[:28]
            d.text(title, 34, y + 6, theme.TEXT_BRIGHT, scale=1)
            if body:
                d.text(body, 34, y + 18, theme.TEXT_DIM, scale=1)

    def _draw_time_row(self, d, panel_y):
        """Time-sync row beneath the brightness slider. Shows the current
        wall-clock time and (when focused) a "Sync now" affordance. A
        recent sync result temporarily replaces the clock with a toast."""
        x = _TIME_PAD
        y = panel_y + _TIME_Y
        w = SW - 2 * _TIME_PAD
        h = _TIME_H

        sel = (self._focus == "time")
        d.rect(x, y, w, h, theme.CARD, fill=True)
        if sel:
            d.rect(x,         y,         w, 1, theme.SEL_BORDER, fill=True)
            d.rect(x,         y + h - 1, w, 1, theme.SEL_BORDER, fill=True)
            d.rect(x,         y,         1, h, theme.SEL_BORDER, fill=True)
            d.rect(x + w - 1, y,         1, h, theme.SEL_BORDER, fill=True)

        _draw_clock(d, x + 6, y + (h - 12) // 2, theme.PRIMARY)

        toast = self._time_toast
        if toast is not None:
            start_ms, msg, key = toast
            if time.ticks_diff(time.ticks_ms(), start_ms) > self._toast_ms \
                    and msg != "syncing…":
                self._time_toast = None
                toast = None

        if toast is not None:
            _, msg, key = toast
            color = (theme.PRIMARY if key == "ok"
                     else theme.GOLD if key == "err"
                     else theme.MUTED)
            d.text(msg[:28], x + 24, y + (h - 8) // 2, color, scale=1)
        else:
            # Live clock readout — HH:MM in the local timezone, plus a
            # right-aligned action hint when focused so the user knows A
            # triggers a manual sync.
            try:
                from oreoOS import timeutil as _tu
                hour, minute, _s, _wd, _d, _m, _y = _tu.now()
                clock = "%02d:%02d" % (hour, minute)
            except Exception:
                clock = "--:--"
            d.text(clock, x + 24, y + (h - 8) // 2,
                   theme.TEXT_BRIGHT, scale=1)
            action = "A=sync ↻" if sel else "Sync time"
            d.text(action, x + w - len(action) * 8 - 8,
                   y + (h - 8) // 2,
                   theme.PRIMARY if sel else theme.MUTED, scale=1)

    def _draw_hint(self, d, panel_y, full_h):
        if self._focus == "quick":
            hint = "L/R=switch  A=toggle  C=close"
        elif self._focus == "bright":
            hint = "L/R=adjust  UP=back  C=close"
        elif self._focus == "time":
            hint = "A=sync  UP/DOWN=move  C=close"
        else:
            hint = "A=open  B=clear  C=close"
        d.text(hint, (SW - len(hint) * 8) // 2,
               panel_y + full_h - 14, theme.TEXT_DIM, scale=1)


def get(os_obj):
    """Singleton accessor — caches the panel on the OS object so the
    run-loop and the launcher both see the same instance."""
    panel = getattr(os_obj, "_notif_panel", None)
    if panel is None:
        panel = NotifPanel(os_obj)
        os_obj._notif_panel = panel
    return panel
