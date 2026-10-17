"""Gestures — phone-style detail screen for IMU gesture toggles.

Reached from Settings → Gestures. Mirrors the WiFi / Bluetooth pattern:
deep settings live in their own app so the main Settings list stays
short.

Each toggle writes to the OS settings dict and immediately nudges the
oreoOS.gestures singleton (`apply_settings()`) so the IMU's power state
updates without waiting for the 2-second auto-refresh.

Controls:
  UP/DOWN  pick a row
  A        toggle (or cycle, on Flip Action)
  HOME     back to Settings
"""

import oreoOS
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

ROW_H        = 22
ROW_PAD_X    = 12
ROW_TOP_Y    = widgets.HEADER_H + 6
VALUE_X      = 168
INDENT_X     = 22       # px the per-gesture rows indent under the master
MASTER_GAP   = 8        # extra space below the master row to set it apart

# Settings keys — kept in sync with oreoOS.gestures.SET_*.
_K_MASTER     = "gestures_enabled"
_K_TAP        = "gesture_tap"
_K_DOUBLE_TAP = "gesture_double_tap"
_K_FLIP_UP    = "gesture_flip_up"
_K_FLIP_ACT   = "gesture_flip_up_action"
_K_HARD_SHAKE = "gesture_hard_shake"

# Flip-up action cycler — order matches oreoOS.gestures.FLIP_ACTIONS.
_FLIP_ACTIONS = ("drawer", "notifs", "wifi", "bt", "camera")
_FLIP_LABELS  = {"drawer": "Apps",   "notifs": "Notifs", "wifi": "WiFi",
                 "bt":     "BT",     "camera": "Camera"}


class App(oreoOS.App):
    name         = "Gestures"
    author       = "Circuit-Overtime"
    SHOW_LOADING = True

    # Logical rows. Children rows are dimmed when the master is OFF.
    ROW_MASTER, ROW_TAP, ROW_DOUBLE, ROW_FLIP, ROW_FLIP_ACTION, ROW_SHAKE = range(6)
    ROWS = (ROW_MASTER, ROW_TAP, ROW_DOUBLE, ROW_FLIP,
            ROW_FLIP_ACTION, ROW_SHAKE)

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._sel   = self.ROW_MASTER
        self._dirty = True

    # ── data ────────────────────────────────────────────────────────────
    def _get(self, key, default=False):
        try:
            return bool(self._os.settings_get(key, default))
        except Exception:
            return bool(default)

    def _set(self, key, value):
        try:
            self._os.settings_set(key, bool(value))
        except Exception:
            pass
        self._nudge_engine()

    def _flip_action(self):
        try:
            return self._os.settings_get(_K_FLIP_ACT, "drawer")
        except Exception:
            return "drawer"

    def _cycle_flip_action(self):
        cur = self._flip_action()
        try:
            i = _FLIP_ACTIONS.index(cur)
        except ValueError:
            i = 0
        nxt = _FLIP_ACTIONS[(i + 1) % len(_FLIP_ACTIONS)]
        try:
            self._os.settings_set(_K_FLIP_ACT, nxt)
        except Exception:
            pass
        self._nudge_engine()

    def _nudge_engine(self):
        """Tell the gesture engine to re-read settings + reconfigure
        the IMU's power state immediately. Cheap when engine isn't yet
        constructed."""
        try:
            from oreoOS import gestures as _g
            g = _g.get(self._os)
            if g:
                g.apply_settings()
        except Exception:
            pass

    # ── input ───────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if btn == api.BTN_HOME:
            self._os.quit()
            return
        if btn == api.BTN_UP:
            self._sel = (self._sel - 1) % len(self.ROWS)
        elif btn == api.BTN_DOWN:
            self._sel = (self._sel + 1) % len(self.ROWS)
        elif btn == api.BTN_A:
            self._activate()
        else:
            return
        self._dirty = True

    def _activate(self):
        r = self._sel
        if r == self.ROW_MASTER:
            self._set(_K_MASTER, not self._get(_K_MASTER))
        elif r == self.ROW_TAP:
            self._set(_K_TAP, not self._get(_K_TAP))
        elif r == self.ROW_DOUBLE:
            self._set(_K_DOUBLE_TAP, not self._get(_K_DOUBLE_TAP))
        elif r == self.ROW_FLIP:
            self._set(_K_FLIP_UP, not self._get(_K_FLIP_UP))
        elif r == self.ROW_FLIP_ACTION:
            self._cycle_flip_action()
        elif r == self.ROW_SHAKE:
            self._set(_K_HARD_SHAKE, not self._get(_K_HARD_SHAKE))

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "GESTURES")
        widgets.draw_hint(d, "A=toggle/cycle  HOME=back")

        master_on = self._get(_K_MASTER)

        # Render order matches ROWS; children get an indent + dimmer
        # text when master is OFF so they read as inactive.
        defs = (
            (self.ROW_MASTER,      "Gestures",   "ON" if master_on else "OFF",
             theme.PRIMARY if master_on else theme.MUTED, False),
            (self.ROW_TAP,         "Tap",
             "ON" if self._get(_K_TAP) else "OFF",
             theme.TEXT_BRIGHT if master_on else theme.MUTED2, True),
            (self.ROW_DOUBLE,      "Double Tap",
             "ON" if self._get(_K_DOUBLE_TAP) else "OFF",
             theme.TEXT_BRIGHT if master_on else theme.MUTED2, True),
            (self.ROW_FLIP,        "Flip Up",
             "ON" if self._get(_K_FLIP_UP) else "OFF",
             theme.TEXT_BRIGHT if master_on else theme.MUTED2, True),
            (self.ROW_FLIP_ACTION, "  Action",
             _FLIP_LABELS.get(self._flip_action(), self._flip_action()),
             theme.TEAL if master_on else theme.MUTED2, True),
            (self.ROW_SHAKE,       "Hard Shake",
             "ON" if self._get(_K_HARD_SHAKE) else "OFF",
             theme.TEXT_BRIGHT if master_on else theme.MUTED2, True),
        )
        for idx, label, value, value_color, indent in defs:
            y = ROW_TOP_Y + idx * ROW_H
            # Push children down so the master row reads as a header.
            if idx != self.ROW_MASTER:
                y += MASTER_GAP
            sel = (idx == self._sel)
            if sel:
                d.rect(4, y - 2, SW - 8, ROW_H - 1,
                       theme.DOCK_SEL, fill=True)
                d.rect(4, y - 2,           SW - 8, 1, theme.SEL_BORDER, fill=True)
                d.rect(4, y + ROW_H - 4,   SW - 8, 1, theme.SEL_BORDER, fill=True)
            text_x = ROW_PAD_X + (INDENT_X if indent else 0)
            label_color = (theme.TEXT_BRIGHT if (idx == self.ROW_MASTER
                                                or master_on)
                           else theme.MUTED2)
            d.text(label, text_x, y + 4, label_color, scale=1)
            d.text(str(value)[:14], VALUE_X, y + 4, value_color, scale=1)

        # Thin divider in the gap between master and children — same
        # visual idiom WiFi uses to separate live-link rows from prefs.
        sep_y = ROW_TOP_Y + self.ROW_MASTER * ROW_H + ROW_H + MASTER_GAP // 2 - 1
        d.rect(ROW_PAD_X, sep_y, SW - 2 * ROW_PAD_X, 1,
               theme.MUTED2, fill=True)

        # Footer hint when master is OFF — explains why children are dim.
        if not master_on:
            msg = "enable Gestures to use these"
            d.text(msg, (SW - len(msg) * 8) // 2,
                   SH - 32, theme.MUTED, scale=1)
