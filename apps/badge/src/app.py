"""Badge — GitHub identity card.

Reads GITHUB_USER from secrets.py. Live-fetches the public profile JSON over
WiFi and renders a centred identity card:

  ╔════════════════════╗
  ║       (avatar)     ║
  ║  Display Name      ║
  ║  @login            ║
  ║  ──────────────    ║
  ║ repos  fol  fol    ║
  ║   42  120  35      ║
  ╚════════════════════╝

The avatar is stamped at deploy time by tools/fetch_avatar.py (committed as
apps/badge/assets/optimized/avatar.py) so it renders on-device without WiFi.

Controls:
  A      refresh stats
  HOME   apps drawer
"""

import oreoOS
from oreoOS import api
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H


def _fetch_profile(username):
    try:
        import urequests
        r = urequests.get("https://api.github.com/users/" + username,
                          headers={"User-Agent": "OreoBadge"})
        if r.status_code != 200:
            r.close()
            return None
        data = r.json(); r.close()
        return {
            "name":      data.get("name") or data.get("login") or username,
            "login":     data.get("login", username),
            "bio":       (data.get("bio") or "")[:60],
            "location":  (data.get("location") or "")[:24],
            "followers": data.get("followers", 0),
            "following": data.get("following", 0),
            "repos":     data.get("public_repos", 0),
        }
    except Exception:
        return None


def _try_avatar():
    """Load the pre-fetched avatar baked at deploy time, or None."""
    try:
        m = __import__("apps.badge.assets.optimized.avatar", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _filled_circle(d, cx, cy, r, color):
    """Approximate filled circle by horizontal scan-lines."""
    for dy in range(-r, r + 1):
        dx = int((r * r - dy * dy) ** 0.5)
        d.rect(cx - dx, cy + dy, dx * 2 + 1, 1, color, fill=True)


def _wrap(text, max_chars):
    """Word-wrap helper — splits at spaces, hard-breaks oversized words."""
    if not text:
        return [""]
    out, cur = [], ""
    for w in text.split():
        cand = (cur + " " + w).strip()
        if len(cand) <= max_chars:
            cur = cand
        else:
            if cur:
                out.append(cur)
                cur = ""
            if len(w) > max_chars:
                while len(w) > max_chars:
                    out.append(w[:max_chars])
                    w = w[max_chars:]
            cur = w
    if cur:
        out.append(cur)
    return out


class App(oreoOS.App):
    name         = "Badge"
    SHOW_LOADING = True

    # Cache the GitHub profile to flash for one hour. On entry we render
    # the cached profile instantly (no spinner) then attempt a background
    # refresh — if it succeeds we swap in the fresh data + re-save.
    CACHE_PATH = "apps/badge/cache.txt"
    CACHE_TTL  = 3600        # seconds (1 hour)

    def on_enter(self, os):
        self._os = os
        try:
            from secrets import GITHUB_USER
            self._user = GITHUB_USER
        except Exception:
            self._user = "octocat"
        self._avatar = _try_avatar()

        # 1) Load whatever's on disk so the card renders immediately.
        cached, age = self._load_cache()
        self._profile  = cached
        self._fresh_ts = age          # age (sec) of what we're showing; None = miss

        # 2) Hit the network ONLY if the cache is missing or stale.
        if cached is None or (age is not None and age > self.CACHE_TTL):
            fresh = _fetch_profile(self._user)
            if fresh:
                self._profile  = fresh
                self._fresh_ts = 0
                self._save_cache(fresh)
        self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            # Manual refresh: bypass TTL, always hit GitHub.
            new = _fetch_profile(self._user)
            if new:
                self._profile  = new
                self._fresh_ts = 0
                self._save_cache(new)
            self._dirty = True

    # ── cache helpers (use oreoOS.cache for TTL-bookkeeping) ────────────
    def _load_cache(self):
        try:
            from oreoOS import cache
            payload, age = cache.load(self.CACHE_PATH)
        except Exception:
            return None, None
        if not payload:
            return None, None
        # Coerce types — cache stores everything as strings.
        try:
            return {
                "name":      payload.get("name", ""),
                "login":     payload.get("login", self._user),
                "bio":       payload.get("bio", ""),
                "location":  payload.get("location", ""),
                "followers": int(payload.get("followers", 0)),
                "following": int(payload.get("following", 0)),
                "repos":     int(payload.get("repos", 0)),
            }, age
        except Exception:
            return None, None

    def _save_cache(self, profile):
        try:
            from oreoOS import cache
            cache.save(self.CACHE_PATH, profile)
        except Exception:
            pass

    def update(self, dt):
        pass

    # ── render ───────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "BADGE")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        if self._profile is None:
            self._draw_offline(d)
            self._dirty = False
            return

        p = self._profile

        # Card centred in the play area.
        play_top = widgets.HEADER_H
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H
        cw, ch   = SW - 24, play_h - 16
        cx, cy   = (SW - cw) // 2, play_top + 8
        # Soft shadow + body + top accent
        d.rect(cx + 2, cy + 2, cw, ch, theme.MUTED2, fill=True)
        d.rect(cx,     cy,     cw, ch, theme.CARD,   fill=True)
        d.rect(cx,     cy,     cw,  3, theme.PRIMARY, fill=True)

        # ── avatar (top-centred, sized to the baked asset, pink ring) ──
        if self._avatar:
            data, aw, ah = self._avatar
            av_sz = max(aw, ah)
        else:
            aw = ah = av_sz = 48
            data = None
        av_cx = SW // 2
        av_cy = cy + 14 + av_sz // 2
        _filled_circle(d, av_cx, av_cy, av_sz // 2 + 3, theme.PRIMARY)
        if data:
            d.blit(data, av_cx - aw // 2, av_cy - ah // 2, aw, ah)
        else:
            _filled_circle(d, av_cx, av_cy, av_sz // 2, theme.CARD)
            letter = (p["login"] or "?")[:1].upper()
            d.text(letter, av_cx - 12, av_cy - 12, theme.PRIMARY, scale=3)

        # ── name + @login centred under avatar, with breathing-room margin
        # so the text block doesn't crowd the pfp.
        TEXT_MARGIN = 18                     # gap between avatar bottom and name
        name_y = av_cy + av_sz // 2 + TEXT_MARGIN
        for line in _wrap(p["name"][:32], 18)[:1]:
            lw = len(line) * 16
            d.text(line, (SW - lw) // 2, name_y, theme.PRIMARY, scale=2)
        name_y += 22

        login_lines = _wrap("@" + p["login"], 24)[:2]
        for ln in login_lines:
            lw = len(ln) * 8
            d.text(ln, (SW - lw) // 2, name_y, theme.TEAL)
            name_y += 10

        # ── stats row at the bottom of the card ──────────────────────
        stats_y = cy + ch - 30
        col_w   = cw // 3
        for i, (lbl, val) in enumerate([
                ("repos",     p["repos"]),
                ("followers", p["followers"]),
                ("following", p.get("following", 0))]):
            mx = cx + col_w * i + col_w // 2
            num = str(val)
            d.text(num, mx - len(num) * 8, stats_y, theme.PRIMARY, scale=2)
            d.text(lbl, mx - len(lbl) * 4, stats_y + 22, theme.MUTED)

        self._dirty = False

    def _draw_offline(self, d):
        cw, ch = SW - 32, SH - widgets.HEADER_H - widgets.HINT_H - 32
        cx, cy = 16, widgets.HEADER_H + 16
        d.rect(cx + 2, cy + 2, cw, ch, theme.MUTED2, fill=True)
        d.rect(cx,     cy,     cw, ch, theme.CARD,   fill=True)
        d.rect(cx,     cy,     cw,  2, theme.PRIMARY, fill=True)
        d.text("offline", (SW - 7 * 16) // 2, cy + 14, theme.PRIMARY, scale=2)
        for i, line in enumerate([
                "Couldn't reach GitHub.",
                "",
                "set on your laptop:",
                "",
                "  WIFI_SSID=...",
                "  WIFI_PASSWORD=...",
                "  GITHUB_USER=" + self._user[:16],
                "",
                "redeploy + press A."]):
            d.text(line, cx + 16, cy + 42 + i * 12, theme.TEXT_BRIGHT)
