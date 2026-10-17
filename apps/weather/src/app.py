"""Weather — live conditions over a full-screen dimmed sky background.

Layout (landscape 320×240):

  ┌──── header ───────────────────────────────┐
  │ WEATHER                                   │
  ├───────────────────────────────────────────┤
  │  (dimmed sky bg fills entire play area)   │
  │                                           │
  │              33° Clear                    │  ← big temp + condition
  │              Kolkata                      │  ← city
  │                                           │
  │               [PANDA]                     │  ← centred mascot
  │                                           │
  │   feels 29°    hum 58%    wind 6 m/s      │  ← metric pill row
  └───────────────────────────────────────────┘

The bg asset (80×60) is upscaled to the play-area size on first frame, then
darkened to ~22 % brightness so white text reads crisply on top. No live
"blur" (per-pixel blur is too slow on MicroPython); the heavy dim achieves
the same visual hierarchy cheaply.

Controls:
  A      force refresh
  HOME   apps drawer
"""

import time
import oreoOS
from oreoOS import api
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

REFRESH_SEC = 600
DIM_FACTOR  = 0.22


def _bucket(code):
    if code is None:        return ("cloud", "Unknown")
    if 200 <= code < 300:   return ("storm", "Thunder")
    if 300 <= code < 600:   return ("rain",  "Rain")
    if 600 <= code < 700:   return ("snow",  "Snow")
    if 700 <= code < 800:   return ("cloud", "Misty")
    if code == 800:         return ("sun",   "Clear")
    if 801 <= code < 900:   return ("cloud", "Cloudy")
    return ("cloud", "Unknown")


def _try_sprite(name):
    try:
        m = __import__("apps.weather.assets.optimized." + name, None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _upscale_dim_bg(data, w, h, sw, sh, factor):
    """Nearest-neighbour upscale of `data` (big-endian RGB565) into a sw×sh
    buffer, with each pixel darkened by `factor`. One-time cost at app entry
    (~250 ms on hardware); thereafter the result is a single blit per frame.
    """
    fac = int(factor * 256)
    # Pre-dim the source once so the upscale inner loop is a 2-byte copy.
    dim = bytearray(w * h * 2)
    for i in range(w * h):
        v = (data[i*2] << 8) | data[i*2 + 1]
        r = ((v >> 11) & 0x1F) * fac >> 8
        g = ((v >>  5) & 0x3F) * fac >> 8
        b = ( v        & 0x1F) * fac >> 8
        v2 = (r << 11) | (g << 5) | b
        dim[i*2]     = v2 >> 8
        dim[i*2 + 1] = v2 & 0xFF

    out      = bytearray(sw * sh * 2)
    sx_step  = (w << 16) // sw
    sy_step  = (h << 16) // sh
    sy       = 0
    for dy in range(sh):
        src_row = (sy >> 16) * w * 2
        sx      = 0
        row_off = dy * sw * 2
        for dx in range(sw):
            src = src_row + (sx >> 16) * 2
            out[row_off + dx * 2]     = dim[src]
            out[row_off + dx * 2 + 1] = dim[src + 1]
            sx += sx_step
        sy += sy_step
    return out


def _fetch_owm(lat, lon, api_key):
    try:
        import urequests
        url = ("https://api.openweathermap.org/data/2.5/weather"
               "?lat=%.3f&lon=%.3f&units=metric&appid=%s" % (lat, lon, api_key))
        r = urequests.get(url, headers={"User-Agent": "OreoBadge"})
        if r.status_code != 200:
            r.close()
            return None
        j = r.json(); r.close()
        return {
            "temp":  round(float(j.get("main", {}).get("temp", 0))),
            "feels": round(float(j.get("main", {}).get("feels_like", 0))),
            "hum":   int(j.get("main", {}).get("humidity", 0)),
            "wind":  float(j.get("wind", {}).get("speed", 0)),
            "code":  int((j.get("weather") or [{"id": 0}])[0].get("id", 0)),
            "city":  j.get("name") or "—",
        }
    except Exception:
        return None


class App(oreoOS.App):
    name         = "Weather"
    SHOW_LOADING = True

    def on_enter(self, os):
        self._os = os
        try:
            from secrets import WEATHER_LAT, WEATHER_LON, OWM_API_KEY
            self._lat = float(WEATHER_LAT)
            self._lon = float(WEATHER_LON)
            self._key = OWM_API_KEY
        except Exception:
            self._lat, self._lon, self._key = 12.97, 77.59, ""

        play_h = SH - widgets.HEADER_H - widgets.HINT_H

        bg = _try_sprite("background")
        if bg:
            data, bw, bh = bg
            self._bg = (_upscale_dim_bg(data, bw, bh, SW, play_h, DIM_FACTOR),
                        SW, play_h)
        else:
            self._bg = None

        self._pandas = {k: _try_sprite("panda_" + k)
                        for k in ("sun", "cloud", "rain", "snow", "storm")}

        self._data  = None
        self._last  = 0
        self._refresh()
        self._dirty = True

    def _refresh(self):
        self._data = _fetch_owm(self._lat, self._lon, self._key) if self._key else None
        self._last = time.ticks_ms()
        self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            self._refresh()

    def update(self, dt):
        if time.ticks_diff(time.ticks_ms(), self._last) > REFRESH_SEC * 1000:
            self._refresh()

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return

        play_top = widgets.HEADER_H
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H

        # Full-play-area dimmed bg, single blit.
        if self._bg:
            data, bw, bh = self._bg
            d.blit(data, 0, play_top, bw, bh)
        else:
            d.rect(0, play_top, SW, play_h, api.rgb(20, 30, 45), fill=True)

        widgets.draw_header(d, "WEATHER")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        if not self._key:
            self._draw_setup_card(d)
            self._dirty = False
            return
        if self._data is None:
            self._draw_offline(d)
            self._dirty = False
            return

        p             = self._data
        cond_key, lbl = _bucket(p["code"])
        sprite        = self._pandas.get(cond_key)

        # Vertical stack centred in the play area:
        #   temp+condition row (40px) / city (16px) / panda (80px) / metric row (14px)
        # Plus 10px gaps between each block. Total ~190 — fits play_h=196.
        gap     = 10
        block_h = 40 + 16 + gap + 80 + gap + 14
        block_y = play_top + max(4, (play_h - block_h) // 2)

        # Big temperature centred, with hollow degree mark + condition tag.
        t_str  = "%d" % p["temp"]
        temp_w = len(t_str) * 40           # scale=5 → 8*5 px per glyph
        deg_w  = 14
        cond_w = len(lbl) * 16             # scale=2 → 8*2 px per glyph
        spacer = 8
        total_w = temp_w + deg_w + spacer + cond_w
        tx      = (SW - total_w) // 2
        d.text(t_str, tx, block_y, api.WHITE, scale=5)
        deg_x   = tx + temp_w + 2
        d.rect(deg_x,     block_y + 4, 8, 8, api.WHITE, fill=False)
        d.rect(deg_x + 2, block_y + 6, 4, 4, api.rgb(20, 30, 45), fill=True)
        d.text(lbl, tx + temp_w + deg_w + spacer,
               block_y + (40 - 16) // 2 + 2, theme.GOLD, scale=2)

        # City — white scale=2 centred under temp.
        city = p["city"][:18]
        cw   = len(city) * 16
        cy   = block_y + 40
        d.text(city, (SW - cw) // 2, cy, api.WHITE, scale=2)

        # Mascot — centred horizontally.
        panda_y = cy + 16 + gap
        if sprite:
            sdata, pw, ph = sprite
            d.blit(sdata, (SW - pw) // 2, panda_y, pw, ph)
        else:
            d.rect((SW - 80) // 2, panda_y, 80, 80, theme.PRIMARY, fill=True)

        # Three centred metric pills.
        m_y = panda_y + 80 + gap
        pills = [
            ("feels", "%d C"  % p["feels"]),
            ("hum",   "%d%%"  % p["hum"]),
            ("wind",  "%d m/s" % round(p["wind"])),
        ]
        pill_widths = [(len(l) + 1 + len(v)) * 8 + 18 for l, v in pills]
        total_pw    = sum(pill_widths) + 8 * (len(pills) - 1)
        px          = (SW - total_pw) // 2
        for i, (label, val) in enumerate(pills):
            pw = pill_widths[i]
            d.rect(px, m_y, pw, 14, theme.PRIMARY, fill=True)
            d.text("%s %s" % (label, val), px + 8, m_y + 3, api.WHITE)
            px += pw + 8

        self._dirty = False

    # ── error cards ────────────────────────────────────────────────────
    def _draw_setup_card(self, d):
        cw, ch = SW - 32, SH - widgets.HEADER_H - widgets.HINT_H - 32
        cx, cy = 16, widgets.HEADER_H + 16
        d.rect(cx, cy, cw, ch, theme.CARD, fill=True)
        d.rect(cx, cy, cw, 2,  theme.PRIMARY, fill=True)
        d.text("setup needed", (SW - 12 * 16) // 2, cy + 14, theme.PRIMARY, scale=2)
        for i, ln in enumerate([
                "Set on your laptop:",
                "",
                "  OWM_API_KEY=...",
                "  WEATHER_LAT=...",
                "  WEATHER_LON=...",
                "",
                "edit .env then redeploy."]):
            d.text(ln, cx + 16, cy + 38 + i * 14, theme.TEXT_BRIGHT)

    def _draw_offline(self, d):
        msg = "offline — press A to retry"
        d.rect(20, 110, SW - 40, 36, theme.CARD, fill=True)
        d.rect(20, 110, SW - 40,  2, theme.PRIMARY, fill=True)
        d.text("offline", (SW - 7 * 16) // 2, 118, theme.PRIMARY, scale=2)
        d.text(msg, (SW - len(msg) * 8) // 2, 138, theme.TEXT_BRIGHT)
