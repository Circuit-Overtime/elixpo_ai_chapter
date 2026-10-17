"""Storage — how the 16 MB flash is being spent.

Shows total used / free at the top, a stacked usage bar, and a per-bucket
breakdown (system / apps / gallery / documents / misc).

Controls:
  A      refresh (re-walks the fs)
  HOME   back to launcher
"""

import oreoOS
from oreoOS import api, theme, widgets
from oreoOS import storage


SW = api.SCREEN_W
SH = api.SCREEN_H

PAD_X      = 12
SUMMARY_Y  = widgets.HEADER_H + 8
SUMMARY_H  = 40
BAR_H      = 10
BAR_GAP    = 6
ROW_H      = 22
ROW_GAP    = 4

# Bucket → display color. Misc gets an explicit brown (vs theme.MUTED
# which is a warm beige that bleeds into the free-space colour); free
# space (the unfilled portion of the bar) gets a clear light grey so
# it reads as "empty", not "another small bucket".
_MISC_BROWN = api.rgb(120,  80,  45)    # solid earthy brown
_FREE_GREY  = api.rgb(210, 215, 220)    # cool grey, distinct from MUTED2

_BUCKET_COLORS = {
    "system":    "PRIMARY",     # pink — the OS itself
    "apps":      "TEAL",        # teal — installed apps
    "gallery":   "GOLD",        # gold — photos
    "documents": "PURPLE",      # purple — text / md
    "misc":      _MISC_BROWN,   # brown — caches + leftovers
}

_BUCKET_LABEL = {
    "system":    "System",
    "apps":      "Apps",
    "gallery":   "Gallery",
    "documents": "Documents",
    "misc":      "Misc",
}


def _human(n):
    if n >= 1024 * 1024:
        return "%.1f MB" % (n / 1024 / 1024)
    if n >= 1024:
        return "%.1f kB" % (n / 1024)
    return "%d B" % n


def _color(name):
    """Resolve a bucket-colour entry — supports either a theme attr name
    (string, e.g. "PRIMARY") or a pre-built api.rgb() integer."""
    if isinstance(name, int):
        return name
    return getattr(theme, name, theme.MUTED)


class App(oreoOS.App):
    name         = "Storage"
    author       = "Circuit-Overtime"
    # storage.usage() does a full os.listdir+stat walk of the flash —
    # ~hundreds of ms on a populated 16 MB filesystem. Without the
    # loading splash the user stares at a frozen previous-app frame
    # until the walk returns. Same applies on every A-refresh, but
    # the splash only covers the initial on_enter; refresh is fast
    # enough on a re-walk that the brief stutter is acceptable.
    SHOW_LOADING = True

    def on_enter(self, os):
        super().on_enter(os)
        self._os    = os
        self._dirty = True
        self._refresh()

    def _refresh(self):
        try:
            self._snap = storage.usage()
        except Exception:
            self._snap = {"stats":  {"total": 0, "free": 0, "used": 0},
                          "buckets": {b: {"bytes": 0, "count": 0}
                                      for b in storage.BUCKETS}}
        self._dirty = True

    def update(self, dt):
        pass

    def on_button_press(self, btn):
        if btn == api.BTN_HOME:
            self._os.quit()
        elif btn == api.BTN_A:
            self._refresh()

    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False

        d.clear(theme.BG)
        widgets.draw_header(d, "STORAGE")

        stats  = self._snap["stats"]
        bks    = self._snap["buckets"]
        total  = stats["total"] or 1     # avoid /0 when statvfs returns zero
        used   = stats["used"]
        free   = stats["free"]

        # ── summary block: "used / total"  +  "free remaining" ──────────
        y = SUMMARY_Y
        d.text("%s used" % _human(used), PAD_X, y, theme.TEXT_BRIGHT, scale=2)
        d.text("of %s" % _human(total),
               PAD_X, y + 18, theme.TEXT_DIM, scale=1)
        free_txt = "%s free" % _human(free)
        # Right-align the free counter so it sits opposite "used".
        tw = len(free_txt) * 8   # framebuf 8x8 at scale=1
        d.text(free_txt, SW - PAD_X - tw, y + 18, theme.TEAL, scale=1)

        # ── stacked usage bar (one segment per non-empty bucket) ────────
        # Base fill = free-space colour. Bucket segments are stacked on
        # top from the left; whatever remains uncovered visualises as
        # free flash.
        bar_y = y + SUMMARY_H
        bar_w = SW - 2 * PAD_X
        d.rect(PAD_X, bar_y, bar_w, BAR_H, _FREE_GREY, fill=True)

        x = PAD_X
        for name in storage.BUCKETS:
            b = bks[name]["bytes"]
            if b <= 0:
                continue
            seg_w = max(1, (b * bar_w) // total)
            # Clip the last segment so we don't overrun the bar from
            # rounding (5 × max(1, …) can sum to > bar_w on small fs).
            if x + seg_w > PAD_X + bar_w:
                seg_w = PAD_X + bar_w - x
                if seg_w <= 0:
                    break
            d.rect(x, bar_y, seg_w, BAR_H, _color(_BUCKET_COLORS[name]), fill=True)
            x += seg_w

        # ── per-bucket rows ─────────────────────────────────────────────
        # Buckets first, then a closing "Free" row so the grey strip in
        # the bar above is also labelled (otherwise users wonder what
        # the unfilled portion represents).
        row_y = bar_y + BAR_H + 10
        legend_rows = [(_BUCKET_LABEL[n], _color(_BUCKET_COLORS[n]),
                        bks[n]["bytes"]) for n in storage.BUCKETS]
        legend_rows.append(("Free", _FREE_GREY, free))
        for label, swatch_color, byte_count in legend_rows:
            sw_x = PAD_X
            sw_w = 10
            d.rect(sw_x, row_y + 4, sw_w, sw_w, swatch_color, fill=True)
            d.text(label, sw_x + sw_w + 8, row_y + 4,
                   theme.TEXT_BRIGHT, scale=1)
            sz_txt = _human(byte_count)
            tw = len(sz_txt) * 8
            d.text(sz_txt, SW - PAD_X - tw, row_y + 4,
                   theme.TEXT_DIM, scale=1)
            row_y += ROW_H

        widgets.draw_hint(d, "A=refresh  HOME=back")
