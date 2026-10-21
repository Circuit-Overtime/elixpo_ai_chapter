"""Updates — version status + install action + per-release changelog.

Reached from:
  * Settings → Version (tap A)
  * About    → tap A on the page
  * Notification panel → tap an "Update available" OTA card

Layout per state (top to bottom):
    ┌─────────── UPDATES ──────────┐
    │      OREO OS  v1.4.19        │  ← always
    │      (LTS  2026-05-16)       │  ← only when UP_TO_DATE
    │      • • • CHECKING • • •    │  ← animated while checking
    │      ─ or, when a release is ─
    │      new version v1.5.0      │
    │      12 files · 47 KB        │
    │   ┌─INSTALL─┐ ┌─CHANGELOG─┐  │  ← only when AVAILABLE/READY
    │   └─────────┘ └───────────┘  │
    └──────────────────────────────┘

Modes (a sub-page system inside this app):
    "main"      version status + buttons
    "changelog" scrollable release notes for the discovered version
"""

import oreoOS
import time
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

S_IDLE        = "idle"
S_CHECKING    = "checking"
S_UP_TO_DATE  = "up_to_date"     # device == latest stable
S_BETA        = "beta"           # device  > latest stable (dev build)
S_AVAILABLE   = "available"      # device  < latest stable (update can install)
S_DOWNLOADING = "downloading"
S_READY       = "ready"
S_FAILED      = "failed"

PAD_X    = 14
TITLE_Y  = widgets.HEADER_H + 12
LOAD_Y   = TITLE_Y + 56
BTN_W    = 134
BTN_H    = 30
BTN_GAP  = 10
BTN_Y    = SH - widgets.HINT_H - BTN_H - 14


class App(oreoOS.App):
    name         = "Updates"
    author       = "Circuit-Overtime"
    SHOW_LOADING = True

    BTN_INSTALL, BTN_CHANGELOG = 0, 1

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._mode  = "main"           # "main" | "changelog"
        self._state = S_IDLE
        self._sel   = self.BTN_INSTALL
        self._release = None
        self._peeked  = None
        self._notes   = ""             # release-body for the changelog page
        self._scroll  = 0              # changelog scroll offset (px)
        self._tick    = 0              # animation tick for the loader sweep
        self._tick_t  = 0.0
        self._loader_phase = "STARTING"
        self._loader_paint_ms = 0
        self._error   = ""
        self._dirty   = True
        # Auto-run a check on entry so the page is meaningful without
        # a manual A press.
        self._run_check()

    # ── update / animation ─────────────────────────────────────────────
    def update(self, dt):
        # Continue the sweep during any non-blocking time between network
        # operations. The HTTP helper also pulses it while its synchronous
        # socket call owns the main loop.
        if (self._mode == "main"
                and self._state in (S_CHECKING, S_DOWNLOADING)):
            self._tick_t += dt
            if self._tick_t >= 0.12:
                self._tick_t = 0.0
                self._tick   = (self._tick + 1) % 24
                self._dirty  = True

    # ── input ──────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if self._mode == "changelog":
            self._on_btn_changelog(btn)
            return
        if btn == api.BTN_HOME:
            self._os.quit()
            return
        if self._state in (S_AVAILABLE, S_READY):
            if btn == api.BTN_LEFT:
                self._sel = self.BTN_INSTALL
                self._dirty = True
            elif btn == api.BTN_RIGHT:
                self._sel = self.BTN_CHANGELOG
                self._dirty = True
            elif btn == api.BTN_A:
                if self._sel == self.BTN_INSTALL:
                    self._run_install()
                else:
                    self._open_changelog()
        else:
            # CHECKING / UP_TO_DATE / FAILED — A = manual re-check.
            if btn == api.BTN_A:
                self._run_check()

    def _on_btn_changelog(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._mode  = "main"
            self._sel   = self.BTN_INSTALL
            self._dirty = True
            return
        if btn == api.BTN_UP:
            self._scroll = max(0, self._scroll - 14)
        elif btn == api.BTN_DOWN:
            self._scroll = min(self._max_scroll(), self._scroll + 14)
        else:
            return
        self._dirty = True

    # ── OTA actions ────────────────────────────────────────────────────
    def _run_check(self):
        try:
            from oreoOS import ota
        except Exception:
            self._state = S_FAILED
            self._error = "ota missing"
            self._dirty = True
            return
        self._state = S_CHECKING
        self._tick  = 0
        self._loader_phase = "STARTING"
        self._loader_paint_ms = 0
        self._dirty = True
        try:
            self.draw(self._os.display); self._os.display.present()
        except Exception:
            pass

        # Always fetch the latest tag — we need to compare against the
        # device's current VERSION to pick the right state, not just
        # "is there a newer one?".
        latest_ver, rel = self._safe(
            lambda: ota.latest_version(on_progress=self._network_pulse)
        ) or (None, None)
        if not latest_ver:
            self._state = S_FAILED
            self._error = "no network"
            self._dirty = True
            return

        cur = self._current_version()
        cmp = ota.compare_version(cur, latest_ver)
        self._release = rel
        self._notes   = (rel or {}).get("notes", "") or ""

        if cmp > 0:
            # Device VERSION is ahead of the latest stable release.
            # Likely a dev build the maintainer flashed directly.
            self._state = S_BETA
            try: self._os.settings_set("ota_status", "beta")
            except Exception: pass
            self._dirty = True
            return

        if cmp == 0:
            # Device matches the latest stable — this is the LTS state.
            self._state = S_UP_TO_DATE
            try: self._os.settings_set("ota_status", "up-to-date")
            except Exception: pass
            self._dirty = True
            return

        # Device is BEHIND latest — surface the new release + peek the
        # manifest so the user can hit Install.
        try: ota.push_update_notification(latest_ver)
        except Exception: pass

        peeked = self._safe(
            lambda: ota.peek(rel, on_progress=self._network_pulse)
        )
        if not peeked:
            self._state = S_FAILED
            self._error = "manifest fetch failed"
            self._dirty = True
            return

        self._peeked = peeked
        try:
            self._os.settings_set("ota_pending_version", latest_ver)
            self._os.settings_set("ota_pending_bytes",   peeked["bytes"])
            self._os.settings_set("ota_pending_url",     rel["manifest_url"])
            self._os.settings_set("ota_status",          "available")
        except Exception:
            pass
        self._state = S_AVAILABLE
        self._sel   = self.BTN_INSTALL
        self._dirty = True

    def _network_pulse(self, phase, received=0):
        """Repaint the loader while a synchronous HTTPS request is active."""
        labels = {
            "dns":      "FINDING GITHUB",
            "connect":  "CONNECTING",
            "tls":      "SECURE LINK",
            "request":  "REQUESTING RELEASE",
            "read":     "READING UPDATE DATA",
            "redirect": "OPENING RELEASE",
        }
        self._loader_phase = labels.get(phase, "CHECKING")

        # Full LCD presentation costs about 31 ms. Throttle body-read pulses
        # so animation does not become the dominant network workload.
        try:
            now = time.ticks_ms()
            if (phase == "read" and self._loader_paint_ms and
                    time.ticks_diff(now, self._loader_paint_ms) < 90):
                return
            self._loader_paint_ms = now
        except Exception:
            pass

        self._tick = (self._tick + 1) % 24
        self._dirty = True
        try:
            self.draw(self._os.display)
            self._os.display.present()
        except Exception:
            pass

    def _run_install(self):
        try:
            from oreoOS import ota
        except Exception:
            self._state = S_FAILED
            self._dirty = True
            return
        if not ota.is_pending():
            if not self._peeked:
                rel = self._safe(lambda: ota.check())
                if not rel:
                    self._state = S_UP_TO_DATE
                    self._dirty = True
                    return
                self._peeked = self._safe(lambda: ota.peek(rel))
                if not self._peeked:
                    self._state = S_FAILED
                    self._dirty = True
                    return
            self._state = S_DOWNLOADING
            self._tick  = 0
            self._dirty = True
            try:
                self.draw(self._os.display); self._os.display.present()
            except Exception:
                pass
            ok = self._safe(lambda: ota.download(self._peeked))
            if not ok:
                self._state = S_FAILED
                self._error = "download failed"
                try: self._os.settings_set("ota_status", "download-failed")
                except Exception: pass
                self._dirty = True
                return
            try: self._os.settings_set("ota_status", "ready")
            except Exception: pass
            self._state = S_READY
        try:
            self._os.settings_set("ota_pending_peek_ok", False)
        except Exception:
            pass
        try:
            import machine
            machine.reset()
        except Exception:
            self._os.quit()

    def _open_changelog(self):
        self._mode   = "changelog"
        self._scroll = 0
        self._dirty  = True

    @staticmethod
    def _safe(fn):
        try:
            return fn()
        except Exception:
            return None

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "UPDATES")
        if self._mode == "changelog":
            self._draw_changelog(d)
            return
        self._draw_main(d)

    def _draw_main(self, d):
        if self._state in (S_AVAILABLE, S_READY):
            widgets.draw_hint(d, "L/R=select  A=confirm  HOME=back")
        elif self._state == S_CHECKING:
            widgets.draw_hint(d, "HOME=back")
        else:
            widgets.draw_hint(d, "A=check  HOME=back")

        # ── Title: OREO OS <version> ──────────────────────────────
        cur = self._current_version()
        title = "OREO OS"
        d.text(title, (SW - len(title) * 16) // 2,
               TITLE_Y, theme.PRIMARY, scale=2)
        d.text(cur, (SW - len(cur) * 16) // 2,
               TITLE_Y + 22, theme.TEXT_BRIGHT, scale=2)

        # ── State-specific middle block ───────────────────────────
        if self._state == S_CHECKING:
            self._draw_loader(d, "CHECKING FOR UPDATES")
            return
        if self._state == S_DOWNLOADING:
            self._draw_loader(d, "DOWNLOADING")
            return
        if self._state == S_UP_TO_DATE:
            self._draw_lts(d)
            return
        if self._state == S_BETA:
            self._draw_beta(d)
            return
        if self._state == S_FAILED:
            msg = (self._error or "something went wrong")[:34]
            d.text(msg, (SW - len(msg) * 8) // 2,
                   LOAD_Y + 6, theme.PRIMARY, scale=1)
            return
        if self._state in (S_AVAILABLE, S_READY):
            self._draw_available(d)
            return
        self._draw_loader(d, "CHECKING FOR UPDATES")

    def _draw_loader(self, d, label):
        # Fixed text avoids the old growing-ellipsis jitter. A bouncing colour
        # segment and five-step activity row provide motion that remains clear
        # on the small panel and under glare.
        d.text(label, (SW - len(label) * 8) // 2,
               LOAD_Y - 2, theme.TEXT_BRIGHT, scale=1)

        track_w = 152
        track_h = 8
        track_x = (SW - track_w) // 2
        track_y = LOAD_Y + 16
        d.rect(track_x, track_y, track_w, track_h, theme.MUTED2, fill=True)
        d.rect(track_x + 2, track_y + 2, track_w - 4, track_h - 4,
               theme.CARD, fill=True)

        travel = track_w - 4 - 30
        step = self._tick % 24
        sweep = step if step <= 12 else 24 - step
        sweep_x = track_x + 2 + (travel * sweep // 12)
        d.rect(sweep_x, track_y + 2, 30, track_h - 4,
               theme.PRIMARY, fill=True)

        dots = 5
        dot_w = 7
        dot_gap = 7
        dots_w = dots * dot_w + (dots - 1) * dot_gap
        dots_x = (SW - dots_w) // 2
        dots_y = LOAD_Y + 34
        active = (self._tick // 2) % dots
        palette = (theme.PRIMARY, theme.GOLD, theme.TEAL)
        for i in range(dots):
            color = palette[i % len(palette)] if i == active else theme.MUTED2
            d.rect(dots_x + i * (dot_w + dot_gap), dots_y,
                   dot_w, dot_w, color, fill=True)

        phase = self._loader_phase[:24]
        d.text(phase, (SW - len(phase) * 8) // 2,
               LOAD_Y + 48, theme.MUTED, scale=1)

    def _draw_lts(self, d):
        # LTS-only compact render. The OREO OS <version> headline above
        # already tells the user where they're at; the redundant
        # "Up to date" heading was just chrome. Drop it so the date
        # has room to breathe and the page stays uncluttered.
        date = self._release_date()
        line = "LTS  " + date
        d.text(line, (SW - len(line) * 16) // 2,
               LOAD_Y + 6, theme.TEAL, scale=2)

    def _draw_beta(self, d):
        # Pink BETA badge — device is running AHEAD of the latest
        # stable release on GitHub (dev / hotfix build).
        d.text("BETA", (SW - 4 * 16) // 2,
               LOAD_Y - 2, theme.PRIMARY, scale=2)
        line = "ahead of stable"
        d.text(line, (SW - len(line) * 8) // 2,
               LOAD_Y + 24, theme.MUTED, scale=1)
        rel = self._release or {}
        ver = rel.get("version", "?")
        sub = "Latest stable: " + ver
        d.text(sub, (SW - len(sub) * 8) // 2,
               LOAD_Y + 38, theme.TEXT_DIM, scale=1)

    def _draw_available(self, d):
        rel = self._release or {}
        ver = rel.get("version", "?")
        d.text("New version", (SW - 11 * 8) // 2,
               LOAD_Y - 8, theme.PRIMARY, scale=1)
        d.text(ver, (SW - len(ver) * 16) // 2,
               LOAD_Y + 4, theme.TEXT_BRIGHT, scale=2)
        if self._peeked:
            kb   = max(1, self._peeked["bytes"] // 1024)
            meta = "%d files  ·  %d KB" % (len(self._peeked["changed"]), kb)
            d.text(meta, (SW - len(meta) * 8) // 2,
                   LOAD_Y + 28, theme.MUTED, scale=1)

        # Two side-by-side buttons.
        total_w = BTN_W * 2 + BTN_GAP
        start_x = (SW - total_w) // 2
        self._draw_btn(d, start_x, self._install_label(), "L",
                       sel=(self._sel == self.BTN_INSTALL), primary=True)
        self._draw_btn(d, start_x + BTN_W + BTN_GAP, "CHANGELOG", "R",
                       sel=(self._sel == self.BTN_CHANGELOG), primary=False)

    def _install_label(self):
        if self._state == S_DOWNLOADING:
            return "..."
        if self._state == S_READY:
            return "REBOOT"
        return "INSTALL"

    def _draw_btn(self, d, x, label, key, sel, primary):
        """Draw one L/R action with an unmistakable keyboard-focus state.

        Previously INSTALL stayed pink even while CHANGELOG had focus, so the
        semantic action colour contradicted the thin selection ring. Now fill,
        text, frame and key badge all agree on exactly one selected action.
        """
        if sel:
            fill  = theme.PRIMARY
            ink   = api.WHITE
            border = theme.GOLD
        else:
            fill  = theme.CARD
            ink   = theme.PRIMARY if primary else theme.TEXT_DIM
            border = theme.MUTED2

        # A two-pixel frame remains readable on the physical 320x240 panel.
        d.rect(x, BTN_Y, BTN_W, BTN_H, border, fill=True)
        d.rect(x + 2, BTN_Y + 2, BTN_W - 4, BTN_H - 4, fill, fill=True)

        # Small physical-key badge above each action. Its fill mirrors focus,
        # so the relationship between LEFT/RIGHT and the selected action is
        # visible before the user reads the bottom hint.
        key_w = 18
        key_h = 11
        key_x = x + (BTN_W - key_w) // 2
        key_y = BTN_Y - key_h - 2
        key_fill = theme.PRIMARY if sel else theme.CARD
        key_ink  = api.WHITE if sel else theme.MUTED
        d.rect(key_x, key_y, key_w, key_h, border, fill=True)
        d.rect(key_x + 1, key_y + 1, key_w - 2, key_h - 2,
               key_fill, fill=True)
        d.text(key, key_x + (key_w - 8) // 2, key_y + 1, key_ink)

        if sel:
            # Gold underline makes focus survive glare and colour wash-out.
            d.rect(x + 8, BTN_Y + BTN_H - 5, BTN_W - 16, 3,
                   theme.GOLD, fill=True)
        d.text(label,
               x + (BTN_W - len(label) * 16) // 2,
               BTN_Y + (BTN_H - 16) // 2,
               ink, scale=2)

    # ── changelog sub-page ─────────────────────────────────────────────
    def _draw_changelog(self, d):
        widgets.draw_hint(d, "UP/DOWN=scroll  B/HOME=back")
        ver = (self._release or {}).get("version", "?")
        title = "CHANGELOG  " + ver
        d.text(title, (SW - len(title) * 8) // 2,
               widgets.HEADER_H + 6, theme.PRIMARY, scale=1)

        body_top = widgets.HEADER_H + 22
        body_bot = SH - widgets.HINT_H - 4
        lines    = self._wrap_lines()
        y = body_top - self._scroll
        for ln in lines:
            if y + 12 < body_top:
                y += 12
                continue
            if y > body_bot:
                break
            d.text(ln, PAD_X, y, theme.TEXT_BRIGHT, scale=1)
            y += 12

        # Scroll thumb on the right edge.
        total_h = len(lines) * 12
        view_h  = body_bot - body_top
        if total_h > view_h:
            track_x = SW - 3
            thumb_h = max(12, int(view_h * view_h / total_h))
            max_s   = max(1, total_h - view_h)
            thumb_y = body_top + (view_h - thumb_h) * self._scroll // max_s
            d.rect(track_x, thumb_y, 2, thumb_h, theme.PRIMARY, fill=True)

    def _wrap_lines(self):
        """Word-wrap `self._notes` (the GitHub release body) to fit at
        scale=1 (~36 chars). Preserves blank lines so the markdown's
        paragraph breaks read correctly."""
        max_chars = (SW - 2 * PAD_X) // 8
        out = []
        for raw_line in (self._notes or "").splitlines():
            if not raw_line.strip():
                out.append("")
                continue
            cur  = ""
            rest = raw_line.split()
            while rest:
                w = rest[0]
                cand = (cur + " " + w) if cur else w
                if len(cand) <= max_chars:
                    cur = cand
                    rest.pop(0)
                    continue
                if cur:
                    out.append(cur)
                    cur = ""
                    continue
                out.append(w[:max_chars])
                rest[0] = w[max_chars:]
            if cur:
                out.append(cur)
        return out

    def _max_scroll(self):
        body_top = widgets.HEADER_H + 22
        body_bot = SH - widgets.HINT_H - 4
        view_h   = body_bot - body_top
        total_h  = len(self._wrap_lines()) * 12
        return max(0, total_h - view_h)

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _current_version():
        try:
            from oreoOS.config import VERSION
            return VERSION
        except Exception:
            return "?"

    @staticmethod
    def _release_date():
        try:
            from oreoOS.config import RELEASE_DATE
            return RELEASE_DATE
        except Exception:
            return "—"
