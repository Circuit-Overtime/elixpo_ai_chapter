import oreoOS
from oreoOS import api, theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H


def _filled_circle(d, cx, cy, r, color):
    for dy in range(-r, r + 1):
        dx = int((r * r - dy * dy) ** 0.5)
        d.rect(cx - dx, cy + dy, dx * 2 + 1, 1, color, fill=True)


def _wrap(text, max_chars):
    """Greedy word-wrap so long display names ('Ayushman Bhattacharya') break
    cleanly onto multiple centred lines instead of trailing off the screen."""
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
            while len(w) > max_chars:
                out.append(w[:max_chars])
                w = w[max_chars:]
            cur = w
    if cur:
        out.append(cur)
    return out


def _try_avatar():
    try:
        m = __import__("apps.identity.assets.optimized.avatar", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _load_identity():
    try:
        from secrets import GITHUB_USER, DISPLAY_NAME, DESIGNATION
    except Exception:
        GITHUB_USER, DISPLAY_NAME, DESIGNATION = "octocat", "Octo Cat", ""
    return {
        "name":        DISPLAY_NAME or GITHUB_USER,
        "login":       GITHUB_USER,
        "designation": DESIGNATION or "",
    }


class App(oreoOS.App):
    name         = "Identity"
    SHOW_LOADING = False

    def on_enter(self, os):
        self._os       = os
        self._avatar   = _try_avatar()
        self._identity = _load_identity()
        self._dirty    = True

    def on_button_press(self, btn):
        pass

    def update(self, dt):
        pass

    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "IDENTITY")
        widgets.draw_hint  (d, "HOME=back")

        p = self._identity

        # Full-play-area card with the same pink top accent as the rest of
        # the OS, so the identity reads as part of the badge's visual brand.
        cx, cy = 12, widgets.HEADER_H + 6
        cw     = SW - 24
        ch     = SH - widgets.HEADER_H - widgets.HINT_H - 12
        d.rect(cx + 2, cy + 2, cw, ch, theme.MUTED2, fill=True)
        d.rect(cx,     cy,     cw, ch, theme.CARD,   fill=True)
        d.rect(cx,     cy,     cw, 3,  theme.PRIMARY, fill=True)
        if self._avatar:
            data, aw, ah = self._avatar
        else:
            data, aw, ah = None, 72, 72
        av_sz = max(aw, ah)

        PAD       = 12
        RING      = 3
        # Pre-compute total block height (avatar row + designation row) so
        # we can vertically centre the whole stack inside the card instead
        # of pinning it to the top.
        desig_row_h = 0
        if p["designation"]:
            desig = p["designation"][:32]
            avail = cw - 16
            dw    = len(desig) * 16
            if dw > avail:
                # rough estimate: 2 wrapped lines at scale=2
                desig_row_h = 18 + 2 * 22 + 4
            else:
                desig_row_h = 18 + 22 + 4
        block_h = (av_sz + RING * 2) + desig_row_h
        block_y = cy + max(PAD, (ch - block_h) // 2)

        av_x      = cx + PAD                       # left edge of pink ring
        av_y      = block_y
        av_cx     = av_x + av_sz // 2
        av_cy     = av_y + av_sz // 2

        _filled_circle(d, av_cx, av_cy, av_sz // 2 + RING, theme.PRIMARY)
        if data:
            d.blit(data, av_cx - aw // 2, av_cy - ah // 2, aw, ah)
        else:
            _filled_circle(d, av_cx, av_cy, av_sz // 2, theme.CARD)
            letter = (p["login"] or "?")[:1].upper()
            d.text(letter, av_cx - 16, av_cy - 16, theme.PRIMARY, scale=4)

        # Name column to the right of the avatar.
        name_x      = av_x + av_sz + RING + PAD
        name_avail  = cx + cw - name_x - PAD
        max_chars   = max(4, name_avail // 16)     # scale=2 → 16 px/glyph
        name_lines  = _wrap(p["name"], max_chars)[:3]

        # Vertically centre the name block on the avatar midline.
        block_h     = len(name_lines) * 22 - 4
        name_y      = av_cy - block_h // 2
        for i, line in enumerate(name_lines):
            d.text(line, name_x, name_y + i * 22, theme.PRIMARY, scale=2)

        # ── designation centred under the avatar+name row ──────────────
        block_bot = max(av_y + av_sz + RING, name_y + block_h)
        desig     = p["designation"][:32]
        if desig:
            dy   = block_bot + 18
            dw   = len(desig) * 16
            avail = cw - 16
            if dw > avail:
                # Two-step shrink: try scale=2 wrap, fall back to scale=1.
                wrapped = _wrap(desig, max(6, avail // 16))[:2]
                for i, ln in enumerate(wrapped):
                    lw = len(ln) * 16
                    d.text(ln, (SW - lw) // 2, dy + i * 22,
                           theme.GOLD, scale=2)
                dy += len(wrapped) * 22
            else:
                d.text(desig, (SW - dw) // 2, dy, theme.GOLD, scale=2)
                dy += 22

            # Gold underline beneath the designation — visual anchor.
            uw = min(120, cw - 60)
            d.rect((SW - uw) // 2, dy + 2, uw, 2, theme.GOLD, fill=True)

        self._dirty = False
