"""IR Quest — focus / beacon receive + manual send.

Three tabs cycled with B:

  FOCUS   live decode of the strongest incoming IR signal. Big hex
          readout + protocol + pulse-count + carrier estimate. Useful as
          a "what's that remote sending" tester.

  BEACON  passive scanner. Shows total frames seen since opening the tab,
          the last decoded hex code (or "raw" for unknown protocols), and
          a recent-history strip of the last six payloads. No baked match
          table — every signal is welcome.

  SEND    replay the last capture or pick a predefined payload, select a
          carrier, then press A to fire.

Hardware: TSOP38238 RX on GPIO 18, 2N2222/IR-LED TX on GPIO 2 via the
oreoWare.ir driver (RMT for TX, pin-edge IRQ for RX).
"""

import time
import oreoOS
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

TAB_FOCUS, TAB_BEACON, TAB_SEND = 0, 1, 2
TAB_NAMES  = ("FOCUS", "BEACON", "SEND")

# Predefined NEC payloads + supported carriers. Hand-edit CODES to add
# more (these go into the SEND tab as a vertical list).
CODES = (
    ("Booth A",  0xCAFEBABE),
    ("Booth B",  0xDEADBEEF),
    ("Booth C",  0xFEEDFACE),
    ("Booth D",  0xC0FFEE00),
    ("Ping",     0x12345678),
    ("Pong",     0x87654321),
)
FREQS = (38000, 40000, 56000)

HISTORY_MAX = 6
SEND_RECORDED = 0


def _hex32(v):
    return "0x%08X" % (v & 0xFFFFFFFF)


class App(oreoOS.App):
    name         = "IR Quest"
    SHOW_LOADING = False
    # IR scanning needs to keep the radio active; don't let the OS doze.
    BLOCK_IDLE   = True

    # ── lifecycle ──────────────────────────────────────────────────────
    def on_enter(self, os):
        self._os  = os
        self._tab = TAB_FOCUS

        # Load the IR driver. Caught so the app still renders on a board
        # without the hardware wired (you'll just see "IR not available").
        self._ir = None
        try:
            from oreoWare import ir
            self._ir = ir
        except Exception:
            self._ir = None

        # SEND-tab persistence
        self._send_sel  = os.settings_get("ir_code_idx",  0) or 0
        self._send_freq = os.settings_get("ir_freq_idx",  0) or 0
        if self._send_sel  > len(CODES): self._send_sel  = 0
        if self._send_freq >= len(FREQS): self._send_freq = 0

        # Live RX state (mutated by _on_packet)
        self._total_frames  = 0
        self._last_code     = None
        self._last_kind     = None       # "nec" / "raw"
        self._last_pulse_n  = 0
        self._last_seen_ms  = 0
        self._last_capture  = None
        self._history       = []         # list of (kind, payload) tuples
        self._error         = None

        # Send-tab feedback timer
        self._send_flash_ms = 0

        self._dirty = True
        self._start_rx()

    def on_exit(self):
        self._stop_rx()
        # Persist the SEND selection so re-opening the app keeps the user's
        # last-used code + freq highlighted.
        try:
            self._os.settings_set("ir_code_idx", self._send_sel)
            self._os.settings_set("ir_freq_idx", self._send_freq)
        except Exception:
            pass

    # ── RX plumbing ─────────────────────────────────────────────────────
    def _start_rx(self):
        if self._ir is None: return
        if self._tab == TAB_SEND: return
        try:
            mode = "beacon" if self._tab == TAB_BEACON else "focus"
            self._ir.start_receive(self._on_packet, mode=mode)
            self._error = None
        except Exception as exc:
            self._error = "RX: %s" % exc
            self._dirty = True

    def _stop_rx(self):
        if self._ir is None: return
        try:
            self._ir.stop_receive()
        except Exception as exc:
            self._error = "RX stop: %s" % exc

    def _on_packet(self, code, info):
        """Driver callback when a complete frame arrives."""
        self._total_frames += 1
        self._last_code     = code
        self._last_kind     = info.get("protocol", "raw")
        self._last_pulse_n  = info.get("pulse_count", 0)
        self._last_seen_ms  = time.ticks_ms()
        self._last_capture  = info
        # Keep a short history for the beacon tab.
        self._history.append((self._last_kind, code))
        if len(self._history) > HISTORY_MAX:
            self._history.pop(0)
        self._dirty = True

    # ── input ──────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if btn == api.BTN_B:
            self._stop_rx()
            self._tab = (self._tab + 1) % 3
            self._start_rx()
            self._dirty = True
            return
        if self._tab == TAB_SEND:
            self._on_send_button(btn)

    def _on_send_button(self, btn):
        if btn == api.BTN_UP:
            self._send_sel = (self._send_sel - 1) % (len(CODES) + 1)
        elif btn == api.BTN_DOWN:
            self._send_sel = (self._send_sel + 1) % (len(CODES) + 1)
        elif btn == api.BTN_LEFT:
            self._send_freq = (self._send_freq - 1) % len(FREQS)
        elif btn == api.BTN_RIGHT:
            self._send_freq = (self._send_freq + 1) % len(FREQS)
        elif btn == api.BTN_A:
            self._fire_send()
        else:
            return
        self._dirty = True

    def _fire_send(self):
        if self._ir is None:
            return
        freq       = FREQS[self._send_freq]
        try:
            # Stop RX briefly during TX so we don't capture our own carrier
            # bleeding into the TSOP — re-arms automatically below.
            self._stop_rx()
            if self._send_sel == SEND_RECORDED:
                self._ir.transmit_capture(self._last_capture,
                                          carrier_hz=int(freq))
            else:
                _, code = CODES[self._send_sel - 1]
                self._ir.transmit_nec(int(code), carrier_hz=int(freq))
            self._error = None
        except Exception as exc:
            self._error = "Send: %s" % exc
        finally:
            self._start_rx()
        if self._error is None:
            self._send_flash_ms = 600

    # ── per-frame ───────────────────────────────────────────────────────
    def update(self, dt):
        if self._ir is not None:
            try:
                self._ir.poll()
            except Exception as exc:
                self._error = "RX: %s" % exc
                self._dirty = True
        # tick the SEND-tab "fired" toast
        if self._send_flash_ms > 0:
            self._send_flash_ms = max(0, self._send_flash_ms - int(dt * 1000))
            self._dirty = True
        # Force redraw on focus tab so "ago" timer refreshes.
        if self._tab == TAB_FOCUS and self._last_seen_ms:
            self._dirty = True

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False

        d.clear(theme.BG)
        self._draw_header(d)
        widgets.draw_hint(d, "B=tab  HOME=back" if self._tab != TAB_SEND
                              else "A=fire  UP/DN=code  L/R=freq  B=tab")

        if self._ir is None:
            self._draw_no_hw(d)
            return

        if self._error:
            self._draw_error(d)
            return

        if self._tab == TAB_FOCUS:
            self._draw_focus(d)
        elif self._tab == TAB_BEACON:
            self._draw_beacon(d)
        else:
            self._draw_send(d)

    # ── header w/ tab indicator ─────────────────────────────────────────
    def _draw_header(self, d):
        H = widgets.HEADER_H
        d.rect(0, 0, SW, H, theme.PRIMARY, fill=True)
        d.rect(0, H - 1, SW, 1, theme.GOLD, fill=True)
        d.text("QUEST", 8, (H - 16) // 2, api.WHITE, scale=2)
        # Tab pills, right-aligned.
        right_x = SW - 8
        for i in range(2, -1, -1):
            tag = TAB_NAMES[i]
            pw  = len(tag) * 8 + 8
            x   = right_x - pw
            if i == self._tab:
                d.rect(x, 6, pw, H - 12, theme.GOLD, fill=True)
                d.text(tag, x + 4, 10, api.BLACK)
            else:
                d.text(tag, x + 4, 10, api.WHITE)
            right_x = x - 4

    # ── tabs ────────────────────────────────────────────────────────────
    def _draw_no_hw(self, d):
        cw, ch = SW - 40, 120
        cx, cy = (SW - cw) // 2, (SH - ch) // 2
        d.rect(cx, cy, cw, ch, theme.CARD,    fill=True)
        d.rect(cx, cy, cw, 3,  theme.PRIMARY, fill=True)
        title = "IR offline"
        d.text(title, (SW - len(title) * 16) // 2, cy + 16, theme.PRIMARY, scale=2)
        msg = ["The IR driver couldn't load.",
               "Check oreoWare.ir + the",
               "TSOP/2N2222 wiring then",
               "reboot the badge."]
        for i, m in enumerate(msg):
            d.text(m, cx + 16, cy + 44 + i * 14, theme.TEXT_BRIGHT)

    def _draw_error(self, d):
        msg = str(self._error)
        if len(msg) > 35:
            msg = msg[:35]
        d.text("IR error", 12, widgets.HEADER_H + 16,
               theme.PRIMARY, scale=2)
        d.text(msg, 12, widgets.HEADER_H + 48, theme.TEXT_BRIGHT)
        d.text("B changes tab / retries RX", 12,
               widgets.HEADER_H + 68, theme.MUTED)

    def _draw_focus(self, d):
        # Big card: the most recent decoded code in giant hex.
        cw, ch = SW - 24, SH - widgets.HEADER_H - widgets.HINT_H - 12
        cx, cy = 12, widgets.HEADER_H + 6
        d.rect(cx, cy, cw, ch, theme.CARD,    fill=True)
        d.rect(cx, cy, cw, 3,  theme.PRIMARY, fill=True)

        d.text("Latest signal", cx + 12, cy + 10, theme.MUTED)

        if self._last_code is None and self._last_kind != "raw":
            msg = "listening..."
            d.text(msg, (SW - len(msg) * 16) // 2, cy + 56,
                   theme.MUTED, scale=2)
            return

        if self._last_code is not None:
            hexs = _hex32(self._last_code)
            d.text(hexs, (SW - len(hexs) * 24) // 2, cy + 40,
                   theme.PRIMARY, scale=3)
            d.text("NEC", (SW - 3 * 8) // 2, cy + 78, theme.GOLD)
        else:
            msg = "raw / unknown"
            d.text(msg, (SW - len(msg) * 16) // 2, cy + 50,
                   theme.PRIMARY, scale=2)

        # Stats row at the bottom of the card.
        info = "pulses %d   carrier ~38 kHz" % self._last_pulse_n
        d.text(info, cx + 12, cy + ch - 22, theme.TEXT_BRIGHT)
        # "Xs ago"
        if self._last_seen_ms:
            ago_s = max(0, time.ticks_diff(time.ticks_ms(),
                                           self._last_seen_ms) // 1000)
            ago = "%ds ago" % ago_s
            d.text(ago, cx + cw - len(ago) * 8 - 12, cy + ch - 22,
                   theme.MUTED)

    def _draw_beacon(self, d):
        cw, ch = SW - 24, SH - widgets.HEADER_H - widgets.HINT_H - 12
        cx, cy = 12, widgets.HEADER_H + 6
        d.rect(cx, cy, cw, ch, theme.CARD,    fill=True)
        d.rect(cx, cy, cw, 3,  theme.PRIMARY, fill=True)

        # Big frame counter top-centre.
        n = "%d" % self._total_frames
        d.text(n, (SW - len(n) * 24) // 2, cy + 10,
               theme.PRIMARY, scale=3)
        sub = "frames seen"
        d.text(sub, (SW - len(sub) * 8) // 2, cy + 44, theme.MUTED)

        # Recent-history strip.
        d.text("Recent:", cx + 12, cy + 64, theme.GOLD)
        if not self._history:
            d.text("(nothing yet)", cx + 84, cy + 64, theme.MUTED)
        else:
            for i, (kind, code) in enumerate(reversed(self._history)):
                y = cy + 80 + i * 14
                if y + 12 > cy + ch:
                    break
                if kind == "nec" and code is not None:
                    line = "%s  NEC" % _hex32(code)
                else:
                    line = "raw / unknown"
                d.text(line, cx + 12, y, theme.TEXT_BRIGHT)

    def _draw_send(self, d):
        cw, ch = SW - 24, SH - widgets.HEADER_H - widgets.HINT_H - 12
        cx, cy = 12, widgets.HEADER_H + 6
        d.rect(cx, cy, cw, ch, theme.CARD,    fill=True)
        d.rect(cx, cy, cw, 3,  theme.PRIMARY, fill=True)

        # Carrier pill at top — LEFT/RIGHT swaps it.
        freq    = FREQS[self._send_freq]
        freq_s  = "Carrier  <  %d kHz  >" % (freq // 1000)
        d.text(freq_s, cx + 12, cy + 10, theme.PRIMARY, scale=2)

        # Captured frame first, followed by predefined NEC codes.
        list_top = cy + 40
        row_h    = 18
        max_rows = (cy + ch - list_top - 16) // row_h
        # Scroll so the selection stays in view.
        first = 0
        if self._send_sel >= max_rows:
            first = self._send_sel - max_rows + 1
        item_count = len(CODES) + 1
        for i in range(first, min(item_count, first + max_rows)):
            if i == SEND_RECORDED:
                name, code = "Recorded", None
            else:
                name, code = CODES[i - 1]
            y   = list_top + (i - first) * row_h
            sel = (i == self._send_sel)
            if sel:
                d.rect(cx + 4, y - 2, cw - 8, row_h, theme.DOCK_SEL, fill=True)
                d.rect(cx + 4, y - 2, 3,      row_h, theme.PRIMARY, fill=True)
            d.text(name, cx + 16, y + 2, theme.PRIMARY if sel else theme.TEXT_BRIGHT, scale=1)
            if code is None:
                hexs = ("%d pulses" % self._last_capture.get("pulse_count", 0)
                        if self._last_capture else "empty")
            else:
                hexs = _hex32(code)
            d.text(hexs, cx + cw - len(hexs) * 8 - 14, y + 2,
                   theme.MUTED)

        # "Fired!" toast for a brief moment after TX.
        if self._send_flash_ms > 0:
            msg = "Sent"
            mw  = len(msg) * 16
            tx  = (SW - mw) // 2
            ty  = SH - widgets.HINT_H - 26
            d.rect(tx - 10, ty - 4, mw + 20, 22, theme.GREEN, fill=True)
            d.text(msg, tx, ty, api.WHITE, scale=2)
