"""Minimal counter app — demonstrates the OreoOS app lifecycle.

Buttons:
    A    increment the counter
    B    decrement the counter
    HOME exit (intercepted by the OS, app never sees it)

Keep this file focused on the lifecycle. As your app grows, split
pure logic into src/<feature>.py and drawing into src/render.py —
see apps/snake/ for the reference layout.
"""

import oreoOS
from oreoOS import api, theme, widgets


class App(oreoOS.App):
    name         = "Example"
    SHOW_LOADING = False   # set True if on_enter takes > 200 ms

    # ── lifecycle ──────────────────────────────────────────────────

    def on_enter(self, os):
        super().on_enter(os)
        self._counter = 0
        self._dirty   = True

    def on_exit(self):
        # Persist state here if your app cares — see /docs/apps for
        # the settings_get/set + plain-file options.
        pass

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            self._counter += 1
            self._dirty = True
        elif btn == api.BTN_B:
            self._counter -= 1
            self._dirty = True

    def update(self, dt):
        # Per-frame logic. dt = seconds since the last frame.
        pass

    def draw(self, d):
        # The framebuf flush is the most expensive thing per frame —
        # gate redraws on self._dirty so we skip the cost when
        # nothing visible has changed.
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "EXAMPLE")
        widgets.draw_hint  (d, "A=+1  B=-1  HOME=back")

        msg = "Counter: %d" % self._counter
        mw  = len(msg) * 16
        d.text(msg,
               (api.SCREEN_W - mw) // 2,
               (api.SCREEN_H - 16) // 2,
               theme.PRIMARY, scale=2)

        self._dirty = False
