"""Bluetooth — placeholder page.

File transfer moved to WiFi (the Send Files row in Settings → WiFi);
no Bluetooth functionality currently ships in the OS. The underlying
oreoWare.bt module + GATT plumbing are kept intact for future
features (badge-to-badge IR-quest assists, peer presence, etc.) but
none of that is wired to a user flow yet — this app just acknowledges
that and points the user at the WiFi transfer page.
"""

import oreoOS
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H


class App(oreoOS.App):
    name         = "Bluetooth"
    author       = "Circuit-Overtime"
    SHOW_LOADING = False

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._dirty = True

    def on_button_press(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._os.quit()

    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "BLUETOOTH")
        widgets.draw_hint(d, "B / HOME to back out")

        cy = SH // 2

        # Big tag
        title = "Coming soon"
        tw = len(title) * 16
        d.text(title, (SW - tw) // 2, cy - 56, theme.PRIMARY, scale=2)

        # Body paragraph (wrapped manually for the tiny screen).
        lines = (
            "File transfer now runs over WiFi.",
            "Open Settings -> WiFi -> Send Files",
            "for the upload URL and pending",
            "approvals.",
            "",
            "BT will return for proximity-",
            "based features (peer presence,",
            "IR-Quest pairing, sync gestures).",
        )
        y = cy - 24
        for line in lines:
            lw = len(line) * 8
            d.text(line, (SW - lw) // 2, y, theme.TEXT_DIM, scale=1)
            y += 12
