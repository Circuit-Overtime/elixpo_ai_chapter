"""WiFi — phone-style detail screen.

Two modes:

  main : the per-row info screen (status / IP / power / auto-connect /
         saved-networks / speed / ping). UP/DOWN walks rows, A toggles
         or drills in.
  nets : the saved-networks sub-page. UP/DOWN walks entries, A connects
         to the focused entry (and promotes it to priority 1), B removes
         it, LEFT toggles its `metered` flag. HOME/B exits the sub-page
         back to main.

Saved networks live in `/wifi.json` on flash, managed by oreoWare.wifi.
The first network from .env is auto-seeded into /wifi.json on first
boot via the wifi module's bootstrap path.
"""

import oreoOS
import time

from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

ROW_H        = 22
ROW_PAD_X    = 12
ROW_TOP_Y    = widgets.HEADER_H + 6
VALUE_X      = 138
AUTOCON_GAP  = 8

POWER_LABELS = {
    "off":      "Off",
    "eco":      "Eco",
    "balanced": "Balanced",
    "max":      "Max",
}

POWER_HINTS = {
    "off":      "radio off",
    "eco":      "5 dBm  · PS",
    "balanced": "11 dBm · PS",
    "max":      "19 dBm · full",
}


def _bars(rssi_dbm):
    if rssi_dbm is None:
        return "----"
    if rssi_dbm >= -50:  return "####"
    if rssi_dbm >= -65:  return "###-"
    if rssi_dbm >= -75:  return "##--"
    if rssi_dbm >= -85:  return "#---"
    return "----"


class App(oreoOS.App):
    name         = "WiFi"
    author       = "Circuit-Overtime"
    SHOW_LOADING = True

    # Logical row indices — keeps cycle code readable when we re-order.
    (ROW_STATUS, ROW_SSID, ROW_IP, ROW_RSSI, ROW_POWER,
     ROW_NETS, ROW_SPEED, ROW_PING, ROW_TRANSFER,
     ROW_AUTOCONNECT) = range(10)
    ROWS = (ROW_STATUS, ROW_SSID, ROW_IP, ROW_RSSI, ROW_POWER,
            ROW_NETS, ROW_SPEED, ROW_PING, ROW_TRANSFER,
            ROW_AUTOCONNECT)

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._sel   = self.ROW_STATUS
        self._dirty = True

        try:
            from oreoWare import wifi
            self._wifi = wifi
        except Exception:
            self._wifi = None

        # 5 Hz info refresh so RSSI and IP track reality without the user
        # having to back out and reopen the app.
        self._poll_t  = 0.0
        self._poll_dt = 0.2
        self._snap    = self._read()

        # Sub-page state
        self._mode    = "main"          # "main" | "nets" | "transfer"
        # Cached cursor inside the transfer-page sender list.
        self._trans_sel = 0
        # LEFT press-timestamp on the Transfer page — used to
        # distinguish tap (deny) from hold (toggle master kill switch).
        # 0 means "not currently pressed."
        self._lp_left_press_ms = 0
        self._nets    = []              # cached saved-networks list
        self._nets_sel = 0

        # One-shot result strings shown under their respective rows.
        # `_speed_label` and `_ping_label` are set after a test runs;
        # they survive until the row's value re-renders normally.
        self._speed_label = ""
        self._ping_label  = ""
        self._busy        = ""          # "speed" | "ping" while a test runs

        # Transfer-page change-detection state. The previous version
        # marked the screen dirty every tick a session existed, which
        # both wasted CPU (continuous repaint at 33 FPS) and produced
        # the *opposite* of speed — input handling and accept() slots
        # were thinner because the run loop spent every frame redrawing.
        # We now repaint only when something visible actually changed,
        # AND set dirty IMMEDIATELY when the session count goes up so
        # a newly-arrived sender shows up on the next frame instead of
        # the next 200ms poll tick.
        self._last_sess_count = 0
        self._last_sess_sig   = ""        # sids joined — detects swaps
        self._last_prog_sig   = ""        # progress (id, received) snapshot
        # Last 'Received' toast — we render a bottom pill for a couple
        # of seconds after the http_server bumps last_upload(). 0 means
        # "no toast active." Filename is what we show in the pill.
        self._toast_seen_ts = 0
        self._toast_name    = ""

    # ── data ────────────────────────────────────────────────────────────
    def _read(self):
        if not self._wifi:
            return {"connected": False}
        try:
            return self._wifi.info()
        except Exception:
            return {"connected": False}

    def _power_mode(self):
        if not self._wifi:
            return "balanced"
        try:
            return self._wifi.get_power_mode()
        except Exception:
            return "balanced"

    def _autoconnect(self):
        try:
            return bool(self._os.settings_get("wifi_autoconnect", True))
        except Exception:
            return True

    def _reload_nets(self):
        try:
            self._nets = self._wifi.list_saved() if self._wifi else []
        except Exception:
            self._nets = []
        if self._nets_sel >= len(self._nets):
            self._nets_sel = max(0, len(self._nets) - 1)

    # ── input ───────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if self._mode == "nets":
            return self._on_button_nets(btn)
        if self._mode == "transfer":
            return self._on_button_transfer(btn)
        return self._on_button_main(btn)

    def _on_button_main(self, btn):
        if btn == api.BTN_HOME:
            self._os.quit()
            return
        if btn == api.BTN_UP:
            self._sel = (self._sel - 1) % len(self.ROWS)
        elif btn == api.BTN_DOWN:
            self._sel = (self._sel + 1) % len(self.ROWS)
        elif btn == api.BTN_A:
            self._activate_row()
        else:
            return
        self._dirty = True

    def _on_button_nets(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B) and not self._nets:
            # Empty list — only escape is back out.
            self._mode = "main"
            self._dirty = True
            return
        if btn == api.BTN_HOME:
            self._mode = "main"
            self._dirty = True
            return
        n = len(self._nets)
        if n == 0:
            return
        if btn == api.BTN_UP:
            self._nets_sel = (self._nets_sel - 1) % n
        elif btn == api.BTN_DOWN:
            self._nets_sel = (self._nets_sel + 1) % n
        elif btn == api.BTN_A:
            self._connect_saved(self._nets[self._nets_sel])
        elif btn == api.BTN_B:
            self._forget_saved(self._nets[self._nets_sel])
        elif btn == api.BTN_LEFT:
            self._toggle_metered(self._nets[self._nets_sel])
        else:
            return
        self._dirty = True

    def _activate_row(self):
        if not self._wifi:
            return
        r = self._sel
        if r == self.ROW_STATUS:
            # Status is the radio-power toggle. Association is a separate
            # state represented by the SSID/IP rows; a powered radio must not
            # look OFF merely because the current network is unavailable.
            on_now = bool(self._snap.get("radio_on"))
            if on_now:
                try:
                    radio_off = getattr(self._wifi, "radio_off", None)
                    if radio_off:
                        radio_off()
                    else:
                        self._wifi.disconnect()
                except Exception:
                    pass
            else:
                # The credentials live in secrets.py / wifi.json — we
                # don't need a "searching" UX. Bring the radio up
                # then call connect_from_config; the pump keeps the
                # run loop responsive so a stuck attempt doesn't hang
                # the badge. Result lands in the next _snap refresh.
                try:
                    radio_on = getattr(self._wifi, "radio_on", None)
                    if radio_on:
                        radio_on()
                except Exception:
                    pass
                # Paint ON immediately, before association starts. Connecting
                # may take several seconds; without this forced frame the
                # button appears to do nothing until the blocking call exits.
                self._snap = self._read()
                self._dirty = True
                try:
                    self.draw(self._os.display)
                    self._os.display.present()
                except Exception:
                    pass
                try:
                    self._wifi.connect_from_config(pump_cb=self._cancel_pump)
                except TypeError:
                    try:
                        self._wifi.connect_from_config()
                    except Exception:
                        pass
                except Exception:
                    pass
                # NOTE: we deliberately do NOT drop the radio when
                # connect_from_config returns False. The previous
                # version did, which silently powered the MAC down on
                # any slow association — the user would tap the
                # toggle, nothing visible would happen, and the next
                # tap would just repeat the same failure. Leaving the
                # radio up means: a tap that doesn't immediately
                # associate at least *stays* "trying", and a later
                # tap to explicitly turn WiFi off still works via
                # the ON-path branch above.
            self._snap = self._read()
        elif r == self.ROW_POWER:
            modes = self._wifi.POWER_MODES
            cur   = self._power_mode()
            try:
                nxt = modes[(modes.index(cur) + 1) % len(modes)]
            except ValueError:
                nxt = modes[0]
            try:
                self._wifi.set_power_mode(nxt)
                self._os.settings_set("wifi_power_mode", nxt)
            except Exception:
                pass
            self._snap = self._read()
        elif r == self.ROW_AUTOCONNECT:
            try:
                self._os.settings_set("wifi_autoconnect",
                                      not self._autoconnect())
            except Exception:
                pass
        elif r == self.ROW_NETS:
            self._reload_nets()
            self._nets_sel = 0
            self._mode     = "nets"
        elif r == self.ROW_TRANSFER:
            self._trans_sel = 0
            self._mode      = "transfer"
        elif r == self.ROW_SPEED:
            self._run_speed_test()
        elif r == self.ROW_PING:
            self._run_ping()

    # ── async-ish helpers (blocking but with a "Testing..." paint) ──────
    def _paint_busy(self, label):
        """Force a frame showing the busy label so the user sees that
        the device hasn't frozen during the synchronous test call."""
        self._busy = label
        self._dirty = True
        try:
            self.draw(self._os.display)
            self._os.display.present()
        except Exception:
            pass

    def _run_speed_test(self):
        if not self._wifi or not self._snap.get("connected"):
            self._speed_label = "no link"
            return
        self._speed_label = "testing…"
        self._paint_busy("speed")

        # Cooperative pump — runs between every recv() inside
        # speed_test. Re-reads the button matrix so a keypress can
        # both keep the OS feeling alive AND abort the test (any
        # press cancels). Also redraws the screen so the user
        # actually SEES the "testing..." label instead of the last
        # pre-test frame.
        cancel = [False]
        def _pump():
            try:
                self._os.buttons.update()
                for b_ in api.BUTTONS:
                    if self._os.buttons.just_pressed(b_):
                        cancel[0] = True
                        return True
            except Exception:
                pass
            return False

        try:
            ok, kbps, ms = self._wifi.speed_test(pump_cb=_pump)
        except Exception:
            ok, kbps, ms = (False, 0, 0)
        self._busy = ""
        if cancel[0]:
            self._speed_label = "cancelled"
        elif not ok or kbps <= 0:
            self._speed_label = "failed"
        elif kbps >= 1000:
            self._speed_label = "%.1f Mbps · %d ms" % (kbps / 1000.0, ms)
        else:
            self._speed_label = "%d kbps · %d ms" % (kbps, ms)
        self._dirty = True

    def _run_ping(self):
        if not self._wifi or not self._snap.get("connected"):
            self._ping_label = "no link"
            return
        self._ping_label = "pinging…"
        self._paint_busy("ping")
        try:
            ok, rtt = self._wifi.ping()
        except Exception:
            ok, rtt = (False, None)
        self._busy = ""
        if not ok or rtt is None:
            self._ping_label = "timeout"
        else:
            self._ping_label = "%d ms" % rtt
        self._dirty = True

    # ── saved-network actions ───────────────────────────────────────────
    def _connect_saved(self, net):
        ssid = net.get("ssid") or ""
        pw   = net.get("password") or ""
        if not ssid:
            return
        # Promote to priority 1 so it auto-reconnects next boot.
        try:
            self._wifi.set_priority(ssid, 1)
        except Exception:
            pass
        # Synchronous connect — blocks the run loop briefly. We don't
        # paint a busy label because the existing Status row already
        # flips "ON"/"OFF" once it's settled.
        try:
            self._wifi.connect(ssid, pw)
        except Exception:
            pass
        self._snap = self._read()
        self._reload_nets()
        self._mode = "main"

    def _forget_saved(self, net):
        ssid = net.get("ssid") or ""
        if not ssid:
            return
        try:
            self._wifi.remove_saved(ssid)
        except Exception:
            pass
        self._reload_nets()

    def _toggle_metered(self, net):
        ssid = net.get("ssid") or ""
        if not ssid:
            return
        try:
            self._wifi.add_saved(ssid, net.get("password") or "",
                                 priority=int(net.get("priority", 10)),
                                 metered=not bool(net.get("metered")))
        except Exception:
            pass
        self._reload_nets()

    # ── update ──────────────────────────────────────────────────────────
    def update(self, dt):
        self._poll_t += dt
        # WiFi info (RSSI, IP, link state) only needs the slow poll —
        # 5 Hz is plenty and keeps the cost low. The transfer-page
        # session/progress check runs OUTSIDE this gate so a new
        # sender appears on the badge within one frame (~30 ms),
        # not within one poll cycle (~200 ms).
        slow_due = self._poll_t >= self._poll_dt
        if slow_due:
            self._poll_t = 0.0
            fresh = self._read()
            if fresh != self._snap:
                self._snap = fresh
                self._dirty = True
        # ── Transfer-page repaint policy ──
        # Instead of marking dirty every tick a session exists (the old
        # behaviour, which kept the screen redrawing at full frame rate
        # and made sender-detection FEEL slow), we compute cheap
        # signatures of what's visible and only redraw on change.
        # This also forces an immediate dirty when a new session
        # appears, so a sender hitting /?prefill=... on their browser
        # shows up on the badge inside the next frame (~30 ms) rather
        # than waiting for the next 200 ms poll cycle.
        if self._mode == "transfer":
            hs = self._http()
            if hs is not None:
                try:
                    sessions = hs.list_sessions()
                except Exception:
                    sessions = []
                sig = ",".join("%s:%s" % (s.get("id", ""),
                                          s.get("state", ""))
                               for s in sessions)
                if sig != self._last_sess_sig:
                    self._last_sess_sig   = sig
                    self._last_sess_count = len(sessions)
                    self._dirty = True
                # Keep the small approval loader animated until the sender's
                # next heartbeat acknowledges the one-press decision.
                if any(s.get("state") == "approving" for s in sessions):
                    self._dirty = True

                prog = hs.progress()
                if prog:
                    psig = "%s:%d" % (prog.get("id", ""),
                                       prog.get("received", 0))
                else:
                    psig = ""
                if psig != self._last_prog_sig:
                    self._last_prog_sig = psig
                    self._dirty = True

                # Toast trigger — bump when http_server records a new
                # upload completion. The pill is visible for TOAST_MS
                # then fades; while it's visible we keep repainting so
                # the auto-dismiss actually happens.
                try:
                    ts, name = hs.last_upload()
                except Exception:
                    ts, name = (0, "")
                if ts and ts != self._toast_seen_ts:
                    self._toast_seen_ts = ts
                    self._toast_name    = name
                    self._dirty = True
                if self._toast_seen_ts and self._toast_name:
                    try:
                        held = time.ticks_diff(time.ticks_ms(),
                                               self._toast_seen_ts)
                    except Exception:
                        held = 0
                    if held < self.TOAST_MS:
                        self._dirty = True
                    elif self._toast_name:
                        # Toast just expired — one more dirty to clear it.
                        self._toast_name = ""
                        self._dirty = True

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        if self._mode == "nets":
            self._draw_nets(d)
            return
        if self._mode == "transfer":
            self._draw_transfer(d)
            return
        widgets.draw_header(d, "WIFI")
        widgets.draw_hint(d, "A=select  HOME=back")

        snap = self._snap
        # Status reflects radio power. SSID/IP independently communicate
        # whether association completed.
        _stat_on = bool(snap.get("radio_on"))
        _stat_label = "ON"          if _stat_on else "OFF"
        _stat_color = theme.PRIMARY if _stat_on else theme.MUTED
        rows = [
            ("Status",       _stat_label, _stat_color),
            ("SSID",         snap.get("ssid") or "—",       theme.TEXT_BRIGHT),
            ("IP",           snap.get("ip") or "—",         theme.TEXT_DIM),
            ("RSSI",         self._rssi_value(snap),        theme.TEXT_DIM),
            ("Power",        POWER_LABELS.get(self._power_mode(), "?"),
                                                             theme.TEAL),
            ("Networks",     self._nets_summary(),          theme.TEXT_BRIGHT),
            ("Speed",        self._speed_label or "—",      theme.TEAL),
            ("Ping",         self._ping_label  or "—",      theme.TEAL),
            ("Send files",   self._transfer_summary(),      theme.PRIMARY),
            ("Auto-connect", "ON" if self._autoconnect() else "OFF",
                             theme.TEXT_BRIGHT),
        ]
        for i, (label, value, color) in enumerate(rows):
            y = ROW_TOP_Y + i * ROW_H
            if i == self.ROW_AUTOCONNECT:
                y += AUTOCON_GAP
            sel = (i == self._sel)
            if sel:
                d.rect(4, y - 2, SW - 8, ROW_H - 1,
                       theme.DOCK_SEL, fill=True)
                d.rect(4, y - 2, SW - 8, 1, theme.SEL_BORDER, fill=True)
                d.rect(4, y + ROW_H - 4, SW - 8, 1,
                       theme.SEL_BORDER, fill=True)
            d.text(label, ROW_PAD_X, y + 4, theme.TEXT_BRIGHT, scale=1)
            d.text(str(value)[:20], VALUE_X, y + 4, color, scale=1)

        # Thin divider above Auto-connect.
        sep_y = ROW_TOP_Y + self.ROW_AUTOCONNECT * ROW_H + AUTOCON_GAP // 2 - 1
        d.rect(ROW_PAD_X, sep_y, SW - 2 * ROW_PAD_X, 1, theme.MUTED2, fill=True)

    def _nets_summary(self):
        try:
            n = len(self._wifi.list_saved()) if self._wifi else 0
        except Exception:
            n = 0
        return "%d saved" % n

    def _draw_nets(self, d):
        widgets.draw_header(d, "NETWORKS")
        widgets.draw_hint(d, "A=connect  B=forget  L=metered")
        if not self._nets:
            self._reload_nets()
        if not self._nets:
            d.text("no saved networks", ROW_PAD_X, ROW_TOP_Y + 16,
                   theme.MUTED, scale=1)
            d.text("flash /wifi.json or add via .env",
                   ROW_PAD_X, ROW_TOP_Y + 34, theme.MUTED2, scale=1)
            return
        cur_ssid = self._snap.get("ssid") or ""
        for i, n in enumerate(self._nets):
            y = ROW_TOP_Y + i * ROW_H
            sel = (i == self._nets_sel)
            if sel:
                d.rect(4, y - 2, SW - 8, ROW_H - 1,
                       theme.DOCK_SEL, fill=True)
                d.rect(4, y - 2, SW - 8, 1, theme.SEL_BORDER, fill=True)
                d.rect(4, y + ROW_H - 4, SW - 8, 1,
                       theme.SEL_BORDER, fill=True)
            ssid = (n.get("ssid") or "?")[:18]
            d.text(ssid, ROW_PAD_X, y + 4, theme.TEXT_BRIGHT, scale=1)
            # Right side: priority number + active dot + metered $.
            pri = "p%d" % int(n.get("priority", 10))
            d.text(pri, VALUE_X, y + 4, theme.MUTED, scale=1)
            x = VALUE_X + 28
            if n.get("ssid") == cur_ssid:
                d.text("●", x, y + 4, theme.PRIMARY, scale=1)
                x += 12
            if n.get("metered"):
                d.text("$", x, y + 4, theme.GOLD, scale=1)

    def _rssi_value(self, snap):
        rssi = snap.get("rssi")
        if rssi is None:
            return "—"
        return "%d dBm %s" % (rssi, _bars(rssi))

    # ── file-transfer sub-page ──────────────────────────────────────────
    def _cancel_pump(self):
        """Passed to wifi.connect_from_config(). Called ~12 Hz from
        inside the wait loop — re-reads the button matrix and returns
        True on any press so the user can abort 'SEARCH' instantly.
        Without this the run loop is frozen for up to 6 s per saved
        network and the badge looks crashed."""
        try:
            self._os.buttons.update()
            for b_ in api.BUTTONS:
                if self._os.buttons.just_pressed(b_):
                    return True
        except Exception:
            pass
        return False

    def _http(self):
        try:
            from oreoOS import http_server as _hs
            return _hs
        except Exception:
            return None

    def _transfer_summary(self):
        """Compact value text for the main-page row: either the live
        sender count, or the URL when idle. Reads the http_server's
        cached state — no network call."""
        hs = self._http()
        if hs is None or not hs.is_running():
            return "off"
        try:
            n = len(hs.list_sessions())
        except Exception:
            n = 0
        if n:
            return "%d active" % n
        return "ready"

    # ── long-press LEFT tracking ──
    # Pressing LEFT once = deny the selected sender. Holding LEFT for
    # LP_HOLD_MS = toggle the transfer-disabled master kill switch.
    # We track the press timestamp on key-down and decide on key-up.
    LP_HOLD_MS = 800

    # Bottom 'Received' toast on the Send Files page — stays visible
    # for this many ms after an upload completes. Kept short so it
    # doesn't compete with the notification panel chip or hide the
    # sender list, but long enough to read.
    TOAST_MS = 2500

    def _on_button_transfer(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._mode = "main"
            self._dirty = True
            return
        hs = self._http()
        if hs is None:
            return

        # Master kill switch on — only `A = re-enable` works in this state.
        try:
            disabled = (hasattr(hs, "is_transfer_enabled")
                        and not hs.is_transfer_enabled())
        except Exception:
            disabled = False
        if disabled:
            if btn == api.BTN_A:
                try: hs.set_transfer_enabled(True)
                except Exception: pass
                self._dirty = True
            return

        if btn == api.BTN_RIGHT:
            # R = refresh the badge code. We deliberately overload R
            # to ALSO retry the WiFi/HTTP reconnect (the previous
            # behaviour) — both are "kick things back into shape"
            # actions and combining them keeps the button budget low.
            try:
                if hasattr(hs, "refresh_code"):
                    hs.refresh_code()
            except Exception:
                pass
            self._refresh_transfer()
            self._dirty = True
            return

        sessions = hs.list_sessions()
        n = len(sessions)
        if btn == api.BTN_UP and n:
            self._trans_sel = (self._trans_sel - 1) % n
        elif btn == api.BTN_DOWN and n:
            self._trans_sel = (self._trans_sel + 1) % n
        elif btn == api.BTN_A and n:
            sid = sessions[self._trans_sel].get("id", "")
            if sid:
                hs.approve(sid)
        elif btn == api.BTN_LEFT:
            # Mark the press-start time on first-press only. Subsequent
            # auto-repeat events skip this branch via the != 0 guard,
            # so a long hold keeps the original timestamp and we can
            # measure full duration in on_button_release. The actual
            # tap-vs-hold decision happens there — firing both deny
            # and toggle on a single press would be confusing.
            if self._lp_left_press_ms == 0:
                self._lp_left_press_ms = time.ticks_ms()
            return     # don't mark dirty — visual state hasn't changed yet
        else:
            return
        self._dirty = True

    def on_button_release(self, btn):
        # LEFT released on the Transfer page — decide tap vs hold and
        # fire exactly one action. The press-start timestamp was
        # captured in _on_button_transfer.
        if self._mode != "transfer" or btn != api.BTN_LEFT:
            return
        start = self._lp_left_press_ms
        self._lp_left_press_ms = 0
        if start == 0:
            return
        held = time.ticks_diff(time.ticks_ms(), start)
        hs = self._http()
        if hs is None:
            return
        if held >= self.LP_HOLD_MS:
            # Long press → toggle the master kill switch.
            try:
                cur = (hs.is_transfer_enabled()
                       if hasattr(hs, "is_transfer_enabled") else True)
                hs.set_transfer_enabled(not cur)
            except Exception:
                pass
        else:
            # Short tap → deny the focused sender, if any.
            sessions = []
            try:
                sessions = hs.list_sessions()
            except Exception:
                pass
            if sessions and 0 <= self._trans_sel < len(sessions):
                sid = sessions[self._trans_sel].get("id", "")
                if sid:
                    try: hs.deny(sid)
                    except Exception: pass
        self._dirty = True

    def _refresh_transfer(self):
        """Reconcile the transfer page with the live network state.

        Order: re-associate WiFi from saved networks (no-op if already
        connected), then call http_server.start() which rebinds onto
        the live IP (no-op if the IP hasn't changed). Both are cheap
        and idempotent — we use them as a 'kick everything back to
        life' button after a roaming WiFi event.
        """
        if self._wifi:
            try:
                if not self._wifi.is_connected():
                    self._wifi.connect_from_config()
            except Exception:
                pass
        hs = self._http()
        if hs is not None:
            try:
                hs.start(self._os)
            except Exception:
                pass
        # Pull a fresh snapshot so the URL line on the page repaints
        # with the new IP if it changed.
        self._snap = self._read()

    def _draw_transfer(self, d):
        widgets.draw_header(d, "SEND FILES")

        hs = self._http()
        running = bool(hs and hs.is_running())

        # ── Master kill switch state — entire screen flips to a
        # ── single "Transfer closed" panel.
        try:
            disabled = (running
                        and hasattr(hs, "is_transfer_enabled")
                        and not hs.is_transfer_enabled())
        except Exception:
            disabled = False
        if disabled:
            widgets.draw_hint(d, "A=re-enable  B=back")
            y = ROW_TOP_Y + 40
            label = "TRANSFER CLOSED"
            d.text(label, (SW - len(label) * 16) // 2, y,
                   theme.PRIMARY, scale=2)
            sub = "File transfer disabled by you."
            d.text(sub, (SW - len(sub) * 8) // 2, y + 28,
                   theme.TEXT_DIM)
            cta = "Tap A to re-enable."
            d.text(cta, (SW - len(cta) * 8) // 2, y + 44,
                   theme.MUTED)
            return

        widgets.draw_hint(d, "A=allow  L=deny  hold-L=close  R=refresh")

        # ── Code header — big 6-char display + TTL countdown ──
        y = ROW_TOP_Y
        if running:
            try:
                code = hs.current_code()
            except Exception:
                code = "------"
            try:
                remain_ms = hs.code_remaining_ms()
            except Exception:
                remain_ms = 0
            # "rotates in 4:32"
            secs = max(0, remain_ms // 1000)
            mins, ss = divmod(secs, 60)
            label = "Type this code in the sender's browser:"
            d.text(label, ROW_PAD_X, y, theme.TEXT_DIM)
            # Big code — scale=3 so it dominates the page.
            code_w = len(code) * 8 * 3
            d.text(code, (SW - code_w) // 2, y + 14,
                   theme.PRIMARY, scale=3)
            # Tiny TTL countdown below the code, centred.
            ttl = "rotates in %d:%02d" % (mins, ss)
            d.text(ttl, (SW - len(ttl) * 8) // 2, y + 14 + 24 + 4,
                   theme.GOLD if remain_ms > 30_000 else theme.PRIMARY)
            # URL hints below the countdown. We show BOTH the mDNS
            # form and the raw IP because multicast DNS is unreliable
            # in the wild — on most networks oreo.local works, but
            # the IP is the universal fallback the user can type into
            # the website's address field.
            url_local = hs.url()
            url_ip    = hs.url_fallback()
            d.text(url_local, ROW_PAD_X, y + 14 + 24 + 18,
                   theme.TEXT_DIM)
            d.text(url_ip,    ROW_PAD_X, y + 14 + 24 + 32,
                   theme.MUTED)
        else:
            d.text("Server offline.", ROW_PAD_X, y, theme.MUTED, scale=1)
            d.text("Connect WiFi to enable transfer.",
                   ROW_PAD_X, y + 14, theme.MUTED2, scale=1)

        # ── live transfer progress bar ──
        # Header now spans: label (14) + code at scale=3 (~26) + TTL
        # (12) + url_local (12) + url_ip (12). Push the body start
        # past that block.
        prog = hs.progress() if hs else None
        prog_y = y + 92
        if prog:
            total = max(1, int(prog.get("total", 0)))
            done  = min(total, int(prog.get("received", 0)))
            pct   = int((done * 100) // total)
            d.text("Receiving %s" % (prog.get("filename", "")[:22] or "?"),
                   ROW_PAD_X, prog_y, theme.TEAL)
            # bar
            bar_x, bar_y, bar_w, bar_h = ROW_PAD_X, prog_y + 14, SW - 2 * ROW_PAD_X, 8
            d.rect(bar_x, bar_y, bar_w, bar_h, theme.MUTED2, fill=True)
            fill_w = int(bar_w * pct / 100)
            d.rect(bar_x, bar_y, fill_w, bar_h, theme.PRIMARY, fill=True)
            d.text("%d%%  %d / %d KB" % (pct, done // 1024, total // 1024),
                   ROW_PAD_X, bar_y + 12, theme.TEXT_DIM)
            list_y = bar_y + 28
        else:
            list_y = prog_y

        # ── pending sender list ──
        # Denied sessions are hidden from the on-badge list: the badge
        # has already made its decision, and surfacing rejected
        # devices is just visual noise. The phone-side page still
        # gets the "denied" verdict from its next beacon poll so the
        # user there can hit refresh and try again with a fresh ID.
        sessions_all = hs.list_sessions() if hs else []
        sessions = [s for s in sessions_all if s.get("state") != "denied"]
        # Clamp the cursor in case a session disappeared between ticks.
        if self._trans_sel >= len(sessions):
            self._trans_sel = max(0, len(sessions) - 1)

        d.rect(ROW_PAD_X, list_y, SW - 2 * ROW_PAD_X, 1, theme.MUTED2, fill=True)
        list_y += 6
        if not sessions:
            d.text("no senders connected",
                   ROW_PAD_X + 2, list_y, theme.MUTED2)
            return

        # State -> dot colour. RGB tuples instead of theme constants
        # because we need a clean green, and the theme palette doesn't
        # ship one — primary is pink-red, teal is too cyan.
        # State → dot colour. State names changed in the new server
        # protocol — "authed" = correct code typed but badge owner
        # hasn't approved yet (yellow); "approving" = owner pressed A and
        # browser acknowledgement is pending; "approved" = green; "denied"
        # is filtered upstream so it shouldn't normally appear.
        dot_color = {
            "authed":   api.rgb(255, 209, 102),    # yellow
            "approving": api.rgb(162, 155, 254),    # lilac
            "approved": api.rgb( 61, 220, 151),    # green
            "denied":   api.rgb(255,  93, 104),    # red (filtered)
            # Legacy fallback for the old "pending" state name —
            # remove once every device is on the new protocol.
            "pending":  api.rgb(255, 209, 102),
        }
        DOT_SIZE   = 8
        DOT_RIGHT  = ROW_PAD_X + 2   # pad from the right edge
        BAR_PAD    = 8               # gap on either side of the bar
        ROW_INNER  = ROW_H - 4

        prog = hs.progress() if hs else None

        for i, s in enumerate(sessions[:5]):
            row_y = list_y + i * ROW_H
            sel   = (i == self._trans_sel)
            if sel:
                d.rect(4, row_y - 2, SW - 8, ROW_H - 1,
                       theme.DOCK_SEL, fill=True)
                d.rect(4, row_y - 2, SW - 8, 1, theme.SEL_BORDER, fill=True)
                d.rect(4, row_y + ROW_H - 4, SW - 8, 1,
                       theme.SEL_BORDER, fill=True)
            sid   = s.get("id", "------")
            state = s.get("state", "pending")

            # ID at scale=1 (smaller than before — the page got too
            # busy with the old scale=2 codes once we added a progress
            # bar and a status dot to the same row).
            d.text(sid, ROW_PAD_X, row_y + 6, theme.TEXT_BRIGHT, scale=1)

            if state == "approving":
                # Immediate feedback for the same physical A press. Animate
                # while the browser performs its next 500 ms heartbeat.
                dots = "." * (1 + ((time.ticks_ms() // 180) % 3))
                d.text("allowing" + dots, ROW_PAD_X + 58, row_y + 6,
                       theme.PURPLE, scale=1)

            # Status dot, right side, vertically centred in the row.
            dx = SW - DOT_RIGHT - DOT_SIZE
            dy = row_y + (ROW_INNER - DOT_SIZE) // 2 + 2
            d.rect(dx, dy, DOT_SIZE, DOT_SIZE,
                   dot_color.get(state, theme.MUTED), fill=True)

            # Mid-row progress bar — only when THIS session is the one
            # currently receiving. Spans the area between the ID text
            # and the status dot.
            if prog and prog.get("id") == sid:
                # Approximate where the SID text ends. Codes are 6
                # chars × 8 px at scale=1 = 48 px.
                bar_x = ROW_PAD_X + 6 * 8 + BAR_PAD
                bar_w = dx - BAR_PAD - bar_x
                if bar_w > 8:
                    total = max(1, int(prog.get("total", 0)))
                    done  = min(total, int(prog.get("received", 0)))
                    pct_w = int(bar_w * done / total)
                    bar_y = row_y + (ROW_INNER - 4) // 2 + 2
                    d.rect(bar_x, bar_y, bar_w, 4,
                           theme.MUTED2, fill=True)
                    d.rect(bar_x, bar_y, pct_w, 4,
                           theme.PRIMARY, fill=True)

        # ── Bottom 'Received' toast ──
        # Renders for self.TOAST_MS after http_server records a
        # completed upload. A subtle pill at the bottom edge of the
        # screen — the full panel still gets the notification panel
        # entry separately; this toast is the in-app cue.
        if self._toast_seen_ts and self._toast_name:
            try:
                held = time.ticks_diff(time.ticks_ms(),
                                       self._toast_seen_ts)
            except Exception:
                held = self.TOAST_MS
            if held < self.TOAST_MS:
                label = "Received  %s" % self._toast_name[:18]
                # Centre the pill horizontally; sit a few pixels above
                # the bottom edge so it doesn't collide with the OS hint
                # bar on devices that draw one.
                txt_w  = len(label) * 8
                pad_x  = 10
                pad_y  = 4
                pill_w = txt_w + 2 * pad_x
                pill_h = 14
                pill_x = max(2, (SW - pill_w) // 2)
                pill_y = SH - pill_h - 6
                d.rect(pill_x, pill_y, pill_w, pill_h,
                       theme.TEAL, fill=True)
                d.text(label, pill_x + pad_x, pill_y + pad_y,
                       theme.BG, scale=1)
