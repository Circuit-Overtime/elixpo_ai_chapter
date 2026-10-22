"""Store — fetch installable apps from the OreoOS GitHub repo.

Catalogue source: github.com/elixpo/oreo `apps_market/`. Each subdir
of that path with a manifest.json + main.py is a candidate. Listing
is cached on flash (/store_cache.json) so the page is usable offline.

Two modes:
  list     — catalogue overview. UP/DOWN walks rows; A on the header
             refreshes from GitHub; A on a card opens its details page.
  details  — single-app page. Manifest + file list fetched lazily so
             the listing API call isn't N+1. Install / Uninstall
             button lives here.

HOME pops one mode level (details → list → quit-to-launcher)."""

import oreoOS
import time
from oreoOS import api, theme, widgets, icons
from oreoOS import store


SW = api.SCREEN_W
SH = api.SCREEN_H

LIST_TOP_Y    = widgets.HEADER_H + 6
HEADER_CARD_H = 36
CARD_H        = 44
CARD_GAP      = 4
ROW_PAD_X     = 10
ICON_BOX      = 32
ACT_W         = 78
ACT_H         = 18

STALE_AFTER_MS = 12 * 60 * 60 * 1000   # 12 h


class App(oreoOS.App):
    name         = "Store"
    author       = "Circuit-Overtime"
    SHOW_LOADING = True

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        # ── list mode state
        self._sel   = 0     # index into self._items (no virtual rows)
        self._top   = 0     # first visible CARD index
        self._state = "LOADING"
        self._msg   = ""
        self._items = []
        # ── details mode state
        self._mode       = "list"   # "list" | "details"
        self._detail     = None     # cached details dict for the open app
        self._detail_for = None     # name_dir the details belong to
        self._detail_action = 0     # installed: 0=open, 1=uninstall
        self._busy       = None
        self._busy_kind  = ""       # "install" | "uninstall"
        self._dirty      = True
        self._progress_received = 0
        self._progress_total    = 0
        self._progress_file     = ""
        self._progress_index    = 0
        self._progress_count    = 0
        self._progress_pct      = -1
        self._progress_paint_ms = 0
        # Surface disk cache immediately, then force a fresh refresh on
        # entry — an empty cache from a previous failed refresh must
        # not block the API call.
        self._items = store.list_market()
        self._refresh(initial=False)

    # ── input ──────────────────────────────────────────────────────────
    # Controls in list mode:
    #   A      = open details for the focused card
    #   B      = quit Store (back to launcher)
    #   LEFT   = manual refresh (C is reserved by the OS notif panel)
    #   UP/DN  = move selection
    #   HOME   = OS-default route through launcher (kept as backup)
    def on_button_press(self, btn):
        if self._mode == "details":
            return self._on_btn_details(btn)
        return self._on_btn_list(btn)

    def _on_btn_list(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._os.quit()
            return
        if btn == api.BTN_LEFT:
            self._refresh(initial=False)
            return
        n = len(self._items)
        if n == 0:
            return
        if btn == api.BTN_UP:
            self._sel = (self._sel - 1) % n
        elif btn == api.BTN_DOWN:
            self._sel = (self._sel + 1) % n
        elif btn == api.BTN_A:
            self._open_details(self._items[self._sel]["dir"])
        else:
            return
        self._scroll_to_sel()
        self._dirty = True

    def _on_btn_details(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._mode = "list"
            self._msg  = ""
            self._busy = None
            self._busy_kind = ""
            for e in self._items:
                e["installed"] = store.is_installed(e["dir"])
            self._dirty = True
            return
        installed = store.is_installed(self._detail_for)
        if installed and btn in (api.BTN_LEFT, api.BTN_RIGHT):
            self._detail_action = 1 - self._detail_action
            self._dirty = True
            return
        if btn == api.BTN_A and isinstance(self._detail, dict) \
           and self._detail.get("ok"):
            if installed and self._detail_action == 0:
                self._open_installed()
            else:
                self._toggle_install(self._detail_for)

    def _open_details(self, name_dir):
        """Switch to details mode + lazily fetch this app's manifest +
        file tree. Paint a 'loading details...' frame first so the
        synchronous GitHub round-trip doesn't look like a freeze."""
        self._mode       = "details"
        self._detail_for = name_dir
        self._detail_action = 0
        self._detail     = None
        self._msg        = "loading details..."
        self._dirty      = True
        try:
            self.draw(self._os.display); self._os.display.present()
        except Exception:
            pass
        self._detail = store.get_details(name_dir)
        if not isinstance(self._detail, dict):
            self._detail = {"ok": False}
        if not self._detail.get("ok"):
            self._msg = store.last_error() or "couldn't load details"
        else:
            self._msg = ""
        self._dirty = True

    def _toggle_install(self, name_dir):
        """Install or uninstall the app in focus on the details page."""
        installed = store.is_installed(name_dir)
        self._busy = name_dir
        self._busy_kind = "uninstall" if installed else "install"
        self._msg  = ""
        self._progress_received = 0
        detail = self._detail if isinstance(self._detail, dict) else {}
        self._progress_total = int(detail.get("bytes") or 0)
        self._progress_file  = ""
        self._progress_index = 0
        self._progress_count = 0
        self._progress_pct   = 0
        self._dirty = True
        try:
            self.draw(self._os.display); self._os.display.present()
        except Exception:
            pass
        if installed:
            ok = store.uninstall(name_dir)
            self._msg = "Uninstalled" if ok else "Uninstall failed"
        else:
            ok = store.install(name_dir, progress_cb=self._on_install_progress)
            self._msg = "Installed" if ok else "Install failed"
        # The drawer caches its app list at module scope — invalidate
        # it so the newly-installed (or just-removed) app shows up on
        # the next drawer open instead of waiting for a reboot.
        if ok:
            self._invalidate_app_menu()
        self._busy = None
        self._busy_kind = ""
        self._detail_action = 0
        self._dirty = True

    def _open_installed(self):
        """Leave Store and chain-launch the installed app."""
        if not self._detail_for or not store.is_installed(self._detail_for):
            self._msg = "App is not installed"
            self._dirty = True
            return
        try:
            self._os.launch(self._detail_for)
        except Exception:
            self._msg = "Couldn't open app"
            self._dirty = True

    def _on_install_progress(self, received, total, filename,
                             file_index, file_count):
        """Paint throttled whole-app download progress during installation."""
        total = max(1, int(total or 0))
        received = max(0, min(total, int(received or 0)))
        pct = min(100, (received * 100) // total)
        now = time.ticks_ms()
        file_changed = file_index != self._progress_index
        try:
            paint_due = time.ticks_diff(now, self._progress_paint_ms) >= 80
        except Exception:
            paint_due = True

        self._progress_received = received
        self._progress_total = total
        self._progress_file = filename or ""
        self._progress_index = int(file_index or 0)
        self._progress_count = int(file_count or 0)
        if not file_changed and pct < 100:
            if not paint_due or pct == self._progress_pct:
                return
        self._progress_pct = pct
        self._progress_paint_ms = now
        self._dirty = True
        try:
            self.draw(self._os.display)
            self._os.display.present()
        except Exception:
            pass

    def _scroll_to_sel(self):
        """Keep the focused row inside the visible window."""
        vis = self._visible_card_count()
        if self._sel < self._top:
            self._top = self._sel
        elif self._sel >= self._top + vis:
            self._top = self._sel - vis + 1

    def _visible_card_count(self):
        # No header card any more, so the entire play area is cards.
        avail = SH - LIST_TOP_Y - widgets.HINT_H - 6
        return max(1, avail // (CARD_H + CARD_GAP))

    # ── refresh action ─────────────────────────────────────────────────
    def _refresh(self, initial):
        self._state = "LOADING"
        self._dirty = True
        try:
            self.draw(self._os.display); self._os.display.present()
        except Exception:
            pass
        try:
            self._items = store.refresh(force=not initial)
            # Refresh may discover a new install or migrate an older market
            # directory to its canonical runtime slug.
            self._invalidate_app_menu()
        except Exception:
            self._items = store.list_market()
            self._state = "ERROR"
            self._msg = "refresh failed"
            self._dirty = True
            return
        self._state = self._classify_state()
        self._dirty = True

    @staticmethod
    def _invalidate_app_menu():
        try:
            from apps.launcher.src.app import invalidate_apps_cache
            invalidate_apps_cache()
        except Exception:
            pass

    def _classify_state(self):
        """Decide the header pill based on what actually happened:
        - last refresh tried + failed → ERROR (with the error string
          stamped into self._msg so the user can see why)
        - wifi physically down → OFFLINE (cache may be valid)
        - cache > 12 h old → STALE
        - otherwise → OK
        We deliberately never show "NO WIFI" when WiFi is actually up
        and the catalogue just happens to be empty (that was the bug)."""
        age = store.cache_age_ms()
        ok  = store.last_refresh_ok()
        wifi_up = self._wifi_up()
        if ok is False and not wifi_up:
            return "OFFLINE"
        if ok is False:
            err = store.last_error() or ""
            if err:
                self._msg = err
            return "ERROR"
        if not self._items:
            # Refresh hasn't actually run yet (cold cache, first boot
            # without a network round-trip) — keep the pill neutral.
            return "LOADING" if ok is None else "OK"
        if age is None:
            return "OK"
        if age > STALE_AFTER_MS:
            return "STALE"
        return "OK"

    @staticmethod
    def _wifi_up():
        try:
            from oreoWare import wifi
            return bool(wifi.is_connected())
        except Exception:
            return False

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "STORE")
        if self._mode == "details":
            if self._busy:
                hint = ("Uninstalling..." if self._busy_kind == "uninstall"
                        else "Installing...")
            elif store.is_installed(self._detail_for):
                hint = "L/R=select  A=go  B=back"
            else:
                hint = "A=install  B=back"
            widgets.draw_hint(d, hint)
        else:
            widgets.draw_hint(d, "A=open  LEFT=refresh  B=quit")

        if self._mode == "details":
            self._draw_details_page(d)
        else:
            self._draw_catalogue(d)
            self._draw_state_chip(d)
        if self._msg:
            _draw_centered(d, self._msg, SH - widgets.HINT_H - 12,
                           theme.PRIMARY)

    def _draw_state_chip(self, d):
        """State chip — centered above the hint bar, top-margin from
        the catalogue list. Renders only for non-OK states so the chip
        stays out of the way once everything's healthy."""
        pill_text, pill_color = self._state_pill()
        if not pill_text:
            return
        pw = len(pill_text) * 8 + 16
        ph = 18
        # 12 px margin above the hint bar.
        py = SH - widgets.HINT_H - ph - 12
        px = (SW - pw) // 2
        d.rect(px, py, pw, ph, pill_color, fill=True)
        d.text(pill_text, px + (pw - len(pill_text) * 8) // 2,
               py + (ph - 8) // 2, api.WHITE, scale=1)

    def _state_pill(self):
        # OK is the implicit / quiet state — no pill at all, the
        # absence of a chip reads as "fresh" so we don't clutter the
        # header on the common case.
        return {
            "LOADING": ("LOADING", theme.MUTED),
            "STALE":   ("STALE",   theme.GOLD),
            "OFFLINE": ("OFFLINE", theme.MUTED),
            "ERROR":   ("ERROR",   theme.PRIMARY),
        }.get(self._state, (None, None))

    def _draw_catalogue(self, d):
        # No empty-state card — the bottom state chip (LOADING /
        # OFFLINE / ERROR / STALE) is enough; a duplicated "no wifi"
        # text in the body would just clutter.
        if not self._items:
            return
        vis = self._visible_card_count()
        for vi in range(vis):
            i = self._top + vi
            if i >= len(self._items):
                break
            self._draw_card(d, LIST_TOP_Y + vi * (CARD_H + CARD_GAP), i)

    def _draw_card(self, d, y, i):
        item = self._items[i]
        # _sel is a direct index into self._items now (no virtual
        # header row above the cards).
        sel  = (self._sel == i)
        bg   = theme.DOCK_SEL if sel else theme.CARD
        d.rect(6, y, SW - 12, CARD_H, bg, fill=True)
        if sel:
            d.rect(6,         y,              SW - 12, 1,       theme.SEL_BORDER, fill=True)
            d.rect(6,         y + CARD_H - 1, SW - 12, 1,       theme.SEL_BORDER, fill=True)
            d.rect(6,         y,              1, CARD_H,         theme.SEL_BORDER, fill=True)
            d.rect(SW - 7,    y,              1, CARD_H,         theme.SEL_BORDER, fill=True)

        # Icon. We try the global optimized icons first — the catalogue
        # entry's `icon` field is a filename like `pet_icon.png` which
        # we map to assets.icons.optimized.<stem>.
        icon = self._icon_for(item)
        if icon:
            data, iw, ih = icon
            d.blit(data, ROW_PAD_X, y + (CARD_H - ih) // 2, iw, ih)
        else:
            letter = str(item.get("name") or "?")[0].upper()
            d.text(letter, ROW_PAD_X + 8, y + 8, theme.PRIMARY, scale=3)

        tx = ROW_PAD_X + ICON_BOX + 10
        d.text(str(item.get("name") or "?")[:18], tx, y + 6,
               theme.TEXT_BRIGHT, scale=2)
        author = str(item.get("author") or "")
        if author:
            d.text(("by " + author)[:24], tx, y + 26, theme.MUTED, scale=1)

        # List view is browse-only: A opens the details page where the
        # install/uninstall button lives. We keep a small "INSTALLED"
        # badge (not a button) so the user can see at a glance which
        # apps are already on the badge, plus a chevron to hint the
        # row is interactive.
        right_x = SW - ROW_PAD_X
        chev_x  = right_x - 14
        if item.get("installed"):
            tag    = "✓"
            tag_w  = 12
            tag_x  = chev_x - tag_w - 6
            tag_y  = y + (CARD_H - 16) // 2
            d.rect(tag_x, tag_y, tag_w, 16, theme.CARD, fill=True)
            d.rect(tag_x, tag_y,           tag_w, 1,  theme.PRIMARY, fill=True)
            d.rect(tag_x, tag_y + 15,      tag_w, 1,  theme.PRIMARY, fill=True)
            d.rect(tag_x, tag_y,           1, 16,     theme.PRIMARY, fill=True)
            d.rect(tag_x + tag_w - 1, tag_y, 1, 16,   theme.PRIMARY, fill=True)
            d.text(tag, tag_x + 2, tag_y + 4, theme.PRIMARY, scale=1)
        d.text(">", chev_x, y + (CARD_H - 16) // 2 + 2,
               theme.PRIMARY if sel else theme.MUTED, scale=2)

    def _icon_for(self, item):
        """Resolve a market app's icon. Lookup order:
          1. Per-app store cache (`/store_icons/<dir>.py`) — populated
             during `store.refresh()` so we can paint the real icon
             BEFORE the app is installed.
          2. The OS-shipped shared icon loader. This covers catalogue icons
             bundled globally and keeps Store consistent with the launcher.
          3. The installed app's own bundled icon
             (`apps.<dir>.assets.optimized.<stem>`) — for apps the user
             already installed.
        Falls through to a letter glyph if nothing matches.
        """
        if not isinstance(item, dict):
            return None
        name_dir  = item.get("dir") or ""
        icon_file = item.get("icon") or ""
        if not isinstance(name_dir, str) or not isinstance(icon_file, str):
            return None
        ico = store.load_store_icon(name_dir) if name_dir else None
        if ico:
            return ico
        if not icon_file:
            return None
        try:
            ico = icons.load(name_dir, icon_file)
            if ico:
                return ico
        except Exception:
            pass
        stem = icon_file.rsplit(".", 1)[0].replace("-", "_")
        # Only try an importable installed-app package name. Market directory
        # names can contain spaces (for example "Oreo Pet"); feeding those to
        # __import__ can raise before the global fallback is reached.
        if name_dir and name_dir.replace("_", "").isalnum() and " " not in name_dir:
            modpath = "apps.%s.assets.optimized.%s" % (name_dir, stem)
            try:
                m = __import__(modpath, None, None, ["DATA", "W", "H"])
                return (m.DATA, m.W, m.H)
            except Exception:
                pass
        return None

    # ── details page ───────────────────────────────────────────────────
    def _draw_details_page(self, d):
        """Centered app details with install or Open / Uninstall actions."""
        if not isinstance(self._detail, dict) or not self._detail.get("ok"):
            # Loading / error case — header card placeholder. The
            # bottom status line (self._msg) carries the explanation.
            self._draw_details_header(d, self._detail_for or "?",
                                      "loading…", None)
            return

        det  = self._detail
        name = det.get("name") or self._detail_for
        self._draw_details_header(d, name, det.get("author"),
                                  det.get("icon"))

        # Description block — wrapped to ~36 chars / line, capped at
        # 5 lines, ellipsis on overflow. Most market manifests won't
        # have a description, in which case we skip the block.
        body_y = widgets.HEADER_H + 6 + 56
        desc = det.get("description") or "No description provided."
        for i, line in enumerate(_wrap(desc, 36, 5)):
            _draw_centered(d, line, body_y + i * 12, theme.TEXT_DIM)

        # Stats line: exact remote download size before install, then live
        # file position while the transfer is running.
        stats_y  = body_y + 5 * 12 + 4
        busy = (self._busy == self._detail_for)
        if busy and self._progress_count:
            stats = "File %d/%d · %s" % (
                self._progress_index,
                self._progress_count,
                self._progress_file.rsplit("/", 1)[-1],
            )
        elif store.is_installed(self._detail_for):
            sz = store.installed_size(self._detail_for)
            stats = "Installed · %s on flash" % _format_size(sz)
        else:
            remote_size = det.get("bytes")
            stats = ("Download · %s" % _format_size(remote_size)
                     if remote_size is not None else "Download size unavailable")
        _draw_centered(d, stats, stats_y, theme.MUTED)

        # Install / Uninstall button — bottom of the play area, full
        # width, dim while busy.
        installed = store.is_installed(self._detail_for)
        btn_h     = 28
        btn_y     = SH - widgets.HINT_H - btn_h - 14
        if busy:
            if self._busy_kind == "uninstall":
                pct = 0
                label, fill, ink = "Removing...", theme.MUTED2, theme.TEXT_BRIGHT
            else:
                pct = max(0, min(100, self._progress_pct))
                label, fill, ink = "Downloading %d%%" % pct, theme.MUTED2, theme.TEXT_BRIGHT
        elif not installed:
            label, fill, ink = "Install on badge", theme.PRIMARY, api.WHITE
        if busy or not installed:
            d.rect(ROW_PAD_X, btn_y, SW - 2 * ROW_PAD_X, btn_h, fill,
                   fill=True)
        if busy and self._busy_kind == "install":
            progress_w = ((SW - 2 * ROW_PAD_X) * pct) // 100
            if progress_w:
                d.rect(ROW_PAD_X, btn_y, progress_w, btn_h,
                       theme.PRIMARY, fill=True)
        if installed and not busy:
            gap = 6
            btn_w = (SW - 2 * ROW_PAD_X - gap) // 2
            _draw_action_button(d, ROW_PAD_X, btn_y, btn_w, btn_h,
                                "Open", self._detail_action == 0, False)
            _draw_action_button(d, ROW_PAD_X + btn_w + gap, btn_y,
                                btn_w, btn_h, "Uninstall",
                                self._detail_action == 1, True)
        else:
            _draw_centered(d, label, btn_y + (btn_h - 16) // 2,
                           ink, scale=2)

    def _draw_details_header(self, d, name, author, icon_filename):
        """Top section of the details page — icon, name, by-line."""
        y = widgets.HEADER_H + 6
        d.rect(6, y, SW - 12, 50, theme.CARD, fill=True)
        d.rect(6, y, SW - 12, 3,  theme.PRIMARY, fill=True)

        # Icon — try the per-app store cache first (same lookup the
        # list view uses) so the details header shows a real icon
        # even for apps that aren't installed yet.
        icon = store.load_store_icon(self._detail_for or "") \
               or self._icon_for_name(icon_filename)
        if icon:
            data, iw, ih = icon
            d.blit(data, ROW_PAD_X, y + (50 - ih) // 2, iw, ih)
        else:
            letter = (name or "?")[0].upper()
            d.text(letter, ROW_PAD_X + 4, y + 8, theme.PRIMARY, scale=4)

        tx = ROW_PAD_X + 40
        text_w = SW - tx - ROW_PAD_X
        _draw_centered(d, str(name), y + 6, theme.TEXT_BRIGHT,
                       scale=2, x0=tx, width=text_w)
        sub = ("by " + str(author)) if author else ""
        _draw_centered(d, sub, y + 28, theme.MUTED,
                       x0=tx, width=text_w)

    @staticmethod
    def _icon_for_name(icon_filename):
        if not isinstance(icon_filename, str) or not icon_filename:
            return None
        try:
            return icons.load("store", icon_filename)
        except Exception:
            return None


def _wrap(text, max_chars, max_lines):
    """Greedy word-wrap; ellipsis on overflow. Returns ≤ max_lines lines."""
    out  = []
    rest = str(text or "").split()
    cur  = ""
    while rest and len(out) < max_lines:
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
    if cur and len(out) < max_lines:
        out.append(cur)
    if rest and out:
        last = out[-1]
        cut  = max_chars - 1
        out[-1] = (last[:cut].rstrip() + "…") if len(last) > cut else last + "…"
    return out


def _format_size(size):
    """Compact byte size that fits the 320 px Store details layout."""
    size = max(0, int(size or 0))
    if size >= 1024 * 1024:
        return "%.1f MB" % (size / (1024.0 * 1024.0))
    if size >= 1024:
        return "%.1f KB" % (size / 1024.0)
    return "%d B" % size


def _draw_centered(d, text, y, color, scale=1, x0=0, width=SW):
    """Draw one clipped text line centered inside the requested region."""
    text = str(text or "")
    char_w = 8 * scale
    text = text[:max(1, width // char_w)]
    x = x0 + max(0, (width - len(text) * char_w) // 2)
    d.text(text, x, y, color, scale=scale)


def _draw_action_button(d, x, y, w, h, label, selected, destructive):
    """Compact two-action button used by installed app details."""
    fill = theme.PRIMARY if selected else theme.CARD
    ink = api.WHITE if selected else (theme.PRIMARY if destructive else theme.TEXT_BRIGHT)
    d.rect(x, y, w, h, fill, fill=True)
    if not selected:
        border = theme.PRIMARY if destructive else theme.MUTED2
        d.rect(x, y, w, 1, border, fill=True)
        d.rect(x, y + h - 1, w, 1, border, fill=True)
        d.rect(x, y, 1, h, border, fill=True)
        d.rect(x + w - 1, y, 1, h, border, fill=True)
    _draw_centered(d, label, y + (h - 16) // 2,
                   ink, scale=2, x0=x, width=w)
