"""Animated boot splash — Oreo OS, 320×240 landscape.

Sequence (~2.6 s):
  0.00–0.25  fancy background fades in (dimmed)
  0.10–0.55  favicon logo drops down from above the screen, settles centre-top
  0.55–0.85  "OREO OS" title types in, scale=3 bright white
  0.80–1.05  "Built By a GenZ" tagline fades in beneath the title
  1.05–2.10  loading bar fills
  2.30–2.60  white-out + fade to black

The background prefers `assets/sprites/optimized/splash_bg.py` (run
`tools/optimize_assets.py splash_bg` after dropping a raw image into
`assets/sprites/raw/`). When that file is absent we paint a procedural
warm confetti-tone gradient so the splash still looks intentional on a
fresh checkout.
"""

import struct
import time
from oreoOS import api
from oreoOS import theme

SW = api.SCREEN_W
SH = api.SCREEN_H

# ── layout (centred vertical stack) ──────────────────────────────────────────
# Transparent favicon logo → title → tagline → loading bar.

_MW, _MH       = 72, 72
_LOGO_REST_Y   = 30                       # final mascot top y
_TITLE_Y       = _LOGO_REST_Y + _MH + 12  # below logo
_TAGLINE_Y     = _TITLE_Y + 30            # below title (scale=3 → 24 px tall)
_BAR_W         = SW - 80
_BAR_X         = (SW - _BAR_W) // 2
_BAR_Y         = SH - 30

TOTAL_MS       = 2600
TAGLINE        = "Built By a GenZ"
TITLE          = "OREO OS"
BG_DIM         = 0.30          # fraction of original brightness


# ── mascot loader (cached) ───────────────────────────────────────────────────

_mascot = None
_splash_logo = None


def _get_splash_logo():
    """Return the transparent favicon sprite, falling back to the mascot."""
    global _splash_logo
    if _splash_logo is not None:
        return _splash_logo if _splash_logo is not False else None
    try:
        import assets.sprites.optimized.favicon_logo as logo
        _splash_logo = (logo.DATA, logo.W, logo.H)
        return _splash_logo
    except (ImportError, AttributeError):
        _splash_logo = _get_mascot()
        return _splash_logo

def _get_mascot():
    """Return (data, w, h) for the mascot sprite. Prefers the chroma-key
    transparent variant so the splash bg shows through around the mascot.

    Resolution order:
      1. assets/sprites/optimized/mascot_transparent.py   (chroma-key, preferred)
      2. assets/sprites/optimized/mascot.py               (cream-bg fallback)
      3. PIL bake at runtime                              (asset rebuild path)
    """
    global _mascot
    if _mascot is not None:
        return _mascot if _mascot is not False else None
    # 1) Transparent (chroma-key magenta) variant — corners blit as
    # transparent so the dimmed splash bg shows through.
    try:
        import assets.sprites.optimized.mascot_transparent as m
        _mascot = (m.DATA, m.W, m.H)
        return _mascot
    except (ImportError, AttributeError):
        pass
    # 2) Cream-bg version (older asset) — still readable, just sits in a
    # square; better than no mascot.
    try:
        import assets.sprites.optimized.mascot as m
        _mascot = (m.DATA, m.W, m.H)
        return _mascot
    except (ImportError, AttributeError):
        pass
    # 3) Build-host fallback: bake from the raw PNG via PIL (never runs
    # on the badge — PIL isn't installed there).
    try:
        from PIL import Image
        img = Image.open("assets/sprites/raw/mascot.png").convert("RGBA").resize(
            (_MW, _MH), Image.LANCZOS)
        bg = Image.new("RGBA", (_MW, _MH), (theme.BG_R, theme.BG_G, theme.BG_B, 255))
        bg.paste(img, mask=img.split()[3])
        rgb = bg.convert("RGB")
        px  = rgb.load()
        words = []
        for y in range(_MH):
            for x in range(_MW):
                r, g, b = px[x, y]
                words.append(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
        data = struct.pack(">%dH" % len(words), *words)
        _mascot = (data, _MW, _MH)
        return _mascot
    except Exception:
        pass
    _mascot = False
    return None


# ── dimmed background (cached) ───────────────────────────────────────────────

_bg = None

def _dim_buf(src, factor):
    """RGB565 big-endian bytes → new bytearray, every pixel × factor."""
    n   = len(src) // 2
    out = bytearray(len(src))
    fac = int(factor * 256)
    for i in range(n):
        v = (src[i*2] << 8) | src[i*2 + 1]
        r = ((v >> 11) & 0x1F) * fac >> 8
        g = ((v >>  5) & 0x3F) * fac >> 8
        b = ( v        & 0x1F) * fac >> 8
        v2 = (r << 11) | (g << 5) | b
        out[i*2]     = v2 >> 8
        out[i*2 + 1] = v2 & 0xFF
    return out


def _upscale(src, sw, sh, dw, dh):
    """Nearest-neighbour upscale of an RGB565 big-endian byte buffer.

    Lets us ship the splash background at a smaller native size (cheap to
    parse, lighter on flash) and inflate to screen dimensions once at boot.
    """
    out      = bytearray(dw * dh * 2)
    sx_step  = (sw << 16) // dw
    sy_step  = (sh << 16) // dh
    sy       = 0
    for dy in range(dh):
        src_row = (sy >> 16) * sw * 2
        sx      = 0
        row_off = dy * dw * 2
        for dx in range(dw):
            s = src_row + (sx >> 16) * 2
            out[row_off + dx * 2]     = src[s]
            out[row_off + dx * 2 + 1] = src[s + 1]
            sx += sx_step
        sy += sy_step
    return out


def _get_bg():
    """Return (data, w, h) for a full-screen dimmed splash backdrop, or None.

    Catches *every* exception type — the splash_bg module is a 150 KB+ bytes
    literal; on a tight-heap boot the parser/_dim_buf can raise MemoryError,
    SyntaxError, or anything in between. If anything goes wrong we fall back
    to the procedural gradient so the splash never crashes the boot path.
    """
    global _bg
    if _bg is not None:
        return _bg if _bg is not False else None
    try:
        # Free as much heap as possible before importing the big asset.
        try:
            import gc
            gc.collect()
        except ImportError:
            pass
        import assets.sprites.optimized.splash_bg as m
        # Dim FIRST (cheap, per-source-pixel), then upscale into a screen-
        # sized buffer. Works for either a native-res 320×240 asset or the
        # half/quarter-res asset we ship to save flash.
        dimmed = _dim_buf(m.DATA, BG_DIM)
        if m.W == SW and m.H == SH:
            _bg = (dimmed, SW, SH)
        else:
            _bg = (_upscale(dimmed, m.W, m.H, SW, SH), SW, SH)
        return _bg
    except Exception:
        pass
    _bg = False
    return None


# ── procedural fallback bg (festive gradient + confetti dots) ────────────────

def _draw_procedural_bg(d):
    """Three-band vertical gradient (pink → cream → gold) with a sparse
    deterministic confetti scatter. Theme-on-brand so the splash looks
    intentional even before a real backdrop asset has been baked."""
    for y in range(SH):
        if y < SH // 3:
            t = y / (SH // 3)
            r = int(theme.PRIMARY_R * (1 - t) + theme.BG_R * t * 0.7)
            g = int(theme.PRIMARY_G * (1 - t) + theme.BG_G * t * 0.7)
            b = int(theme.PRIMARY_B * (1 - t) + theme.BG_B * t * 0.7)
        elif y > (2 * SH) // 3:
            t = (y - 2 * SH // 3) / (SH // 3)
            r = int(theme.BG_R * (1 - t) * 0.7 + theme.GOLD_R * t)
            g = int(theme.BG_G * (1 - t) * 0.7 + theme.GOLD_G * t)
            b = int(theme.BG_B * (1 - t) * 0.7 + theme.GOLD_B * t)
        else:
            r, g, b = int(theme.BG_R * 0.6), int(theme.BG_G * 0.55), int(theme.BG_B * 0.5)
        d.rect(0, y, SW, 1, api.rgb(r, g, b), fill=True)
    seed = 0xC0FFEE
    palette = [theme.PRIMARY, theme.GOLD, theme.TEAL]
    for _ in range(60):
        seed = (seed * 1103515245 + 12345) & 0xFFFFFFFF
        x = seed % SW
        seed = (seed * 1103515245 + 12345) & 0xFFFFFFFF
        y = seed % SH
        # avoid the centre 200×130 strip where the logo / title sit
        if (SW - 200) // 2 < x < (SW + 200) // 2 and \
           (SH - 130) // 2 < y < (SH + 130) // 2:
            continue
        col = palette[seed % 3]
        sz  = 2 + (seed >> 4) % 3
        d.rect(x, y, sz, sz, col, fill=True)


# ── helpers ──────────────────────────────────────────────────────────────────

def _ms():       return time.ticks_ms()
def _diff(a, b): return time.ticks_diff(a, b)

def _phase(elapsed, s, e):
    t = elapsed / TOTAL_MS
    if t < s:  return 0.0
    if t >= e: return 1.0
    return (t - s) / (e - s)


def _draw_text_centered(d, s, y, color, scale=1):
    w = len(s) * 8 * scale
    d.text(s, (SW - w) // 2, y, color, scale=scale)


# ── show_splash ──────────────────────────────────────────────────────────────

def show_shake_mascot(os_obj, duration_ms=2400):
    """Quick reaction to a HARD_SHAKE gesture — paints the mascot at
    centre with a 'head spinning' compress/expand animation.

    The chroma-key mascot already exists in assets; here we just
    horizontally squish it (W × scale_x) and bounce the scale_x between
    0.25 and 1.0 a few times to fake rotation around the vertical axis.
    Cheap enough to run as a blocking overlay — duration_ms keeps the
    block bounded so the OS run-loop resumes shortly after.
    """
    d = os_obj.display
    mascot = _get_mascot()
    if not mascot:
        return
    data, mw, mh = mascot
    cx = SW // 2
    y0 = (SH - mh) // 2

    # Pre-paint background once so the mascot is the only thing
    # changing per frame. Cheap painted card instead of bg image so
    # there's no large asset hit at gesture time.
    d.clear(theme.BG)
    d.rect(0, 0, SW, 28, theme.PRIMARY, fill=True)
    label = "WHOA!"
    d.text(label, (SW - len(label) * 16) // 2, 6, api.WHITE, scale=2)
    sub   = "shake detected"
    d.text(sub, (SW - len(sub) * 8) // 2, SH - 24, theme.MUTED, scale=1)
    d.present()

    import math as _math
    start = _ms()
    last_w = -1
    while True:
        t = _diff(_ms(), start)
        if t >= duration_ms:
            break
        # 0..1 ramp through 4 full cycles
        phase = (t / duration_ms) * 4.0
        s     = abs(_math.cos(phase * _math.pi))      # 1 → 0 → 1 cycle
        new_w = max(2, int(mw * (0.25 + 0.75 * s)))   # never zero
        if new_w == last_w:
            try: _sleep_ms(20)
            except Exception: pass
            continue
        last_w = new_w
        # Repaint the mascot strip — wipe the previous draw with bg.
        d.rect(0, y0, SW, mh, theme.BG, fill=True)
        # Compress the mascot horizontally to new_w.
        data2 = _compress_x(data, mw, mh, new_w)
        if data2 is not None:
            d.blit(data2, cx - new_w // 2, y0, new_w, mh)
        d.present()
        try: time.sleep_ms(20)
        except Exception: pass


def _compress_x(src, sw, sh, dst_w):
    """Horizontally compress an RGB565 BE sprite to width dst_w.

    Mirrors the helper in apps/launcher — kept private here so splash
    doesn't drag a launcher import along for one reaction animation.
    """
    if dst_w >= sw:
        return src
    if dst_w <= 0:
        return None
    src_stride = sw * 2
    out_stride = dst_w * 2
    out = bytearray(out_stride * sh)
    col_map = [c * sw // dst_w for c in range(dst_w)]
    for ry in range(sh):
        sb = ry * src_stride
        ob = ry * out_stride
        for ox in range(dst_w):
            so = sb + col_map[ox] * 2
            do = ob + ox * 2
            out[do]     = src[so]
            out[do + 1] = src[so + 1]
    return out


def show_updating(os_obj, target_version, total_files):
    """Draw a system-update splash while OTA files are being copied.

    Modelled on the app-loader slide: a pink panel fills the screen with a
    vertically centred title, progress bar, target version and safety copy.
    The caller advances the bar via update_progress(). Returns a callable
    `(done_count, current_file) -> None` so the apply step can pump
    progress without re-doing all the panel rendering each call.
    """
    d  = os_obj.display
    SW = api.SCREEN_W
    SH = api.SCREEN_H

    # Build the complete block around the screen centre instead of anchoring
    # individual elements to unrelated offsets. This keeps the title, bar,
    # version, warning and current filename visually balanced as one unit.
    d.rect(0, 0, SW, SH, theme.PRIMARY, fill=True)
    centre_y = SH // 2
    title_y  = centre_y - 54
    bar_y    = centre_y - 20
    bar_h    = 10
    version_y = bar_y + bar_h + 10
    warning_y = version_y + 20
    file_y    = warning_y + 18

    title = "UPDATING OREOOS"
    tw    = len(title) * 16
    d.text(title, (SW - tw) // 2, title_y, api.WHITE, scale=2)

    bar_x = 30
    bar_w = SW - 60
    # Gold outer frame separates the progress track from the pink panel.
    d.rect(bar_x - 2, bar_y - 2, bar_w + 4, bar_h + 4,
           theme.GOLD, fill=True)
    d.rect(bar_x, bar_y, bar_w, bar_h, api.rgb(40, 40, 40), fill=True)

    # The target version belongs to the progress operation, so keep it just
    # below the bar rather than near the title. Scale 2 makes the destination
    # unambiguous from normal status text.
    version = target_version or "unknown"
    vw = len(version) * 16
    d.text(version, (SW - vw) // 2, version_y, theme.GOLD, scale=2)
    d.text("do not unplug", (SW - 13 * 8) // 2, warning_y,
           api.WHITE)
    d.present()

    def _advance(done, current_file=""):
        # Only repaint the bar's filled portion + the file-name strip to
        # keep this cheap (full-screen reflows during an OTA apply would
        # add 30+ ms of GC pressure per file).
        pct = done / float(max(1, total_files))
        fill_w = int(bar_w * pct)
        d.rect(bar_x, bar_y, bar_w, bar_h, api.rgb(40, 40, 40), fill=True)
        if fill_w:
            d.rect(bar_x, bar_y, fill_w, bar_h, theme.GOLD, fill=True)
        # Clear + re-draw the file-name line under the bar.
        d.rect(0, file_y, SW, 14, theme.PRIMARY, fill=True)
        name = (current_file or "")[:38]
        if name:
            d.text(name, (SW - len(name) * 8) // 2, file_y,
                   api.WHITE)
        d.present()

    return _advance


def show_splash(os_obj):
    d     = os_obj.display
    start = _ms()
    bg    = _get_bg()
    bg_drawn = False

    while True:
        elapsed = _diff(_ms(), start)
        if elapsed >= TOTAL_MS:
            break

        # Background — paint once, then reuse. The logo / text draw on top
        # of the same pixels every frame; redrawing the full bg per frame
        # would blow the 30-fps budget without a backbuffer.
        if not bg_drawn:
            if bg:
                data, bw, bh = bg
                d.blit(data, 0, 0, bw, bh)
            else:
                _draw_procedural_bg(d)
            bg_drawn = True

        # ── logo: slides down from y=-mh to y=_LOGO_REST_Y (ease-out cubic)
        p_logo = _phase(elapsed, 0.04, 0.21)
        if p_logo > 0:
            mascot = _get_splash_logo()
            y      = int(-_MH + (_LOGO_REST_Y + _MH) * (1 - (1 - p_logo) ** 3))
            if mascot:
                data, mw, mh = mascot
                try:
                    d.blit(data, (SW - mw) // 2, y, mw, mh)
                except Exception:
                    d.rect((SW - _MW) // 2, y, _MW, _MH, theme.PRIMARY, fill=True)
            else:
                d.rect((SW - _MW) // 2, y, _MW, _MH, theme.PRIMARY, fill=True)

        # ── title: types in, scale=3 bright white ──────────────────────────
        p_title = _phase(elapsed, 0.21, 0.33)
        if p_title > 0:
            n = max(1, int(p_title * len(TITLE)))
            _draw_text_centered(d, TITLE[:n], _TITLE_Y, api.WHITE, scale=3)

        # ── tagline: appears once title finishes typing ────────────────────
        p_tag = _phase(elapsed, 0.31, 0.40)
        if p_tag > 0:
            _draw_text_centered(d, TAGLINE, _TAGLINE_Y, theme.GOLD, scale=2)

        # ── loading bar ────────────────────────────────────────────────────
        p_bar = _phase(elapsed, 0.40, 0.81)
        if p_bar > 0:
            d.rect(_BAR_X, _BAR_Y, _BAR_W, 5, api.rgb(80, 60, 60), fill=True)
            filled = max(2, int(p_bar * _BAR_W))
            d.rect(_BAR_X, _BAR_Y, filled, 5, theme.PRIMARY, fill=True)

        d.present()
        time.sleep_ms(20)

    # No final clear — the last splash frame stays on screen until the home
    # screen renders. That eliminates the dark gap between the splash and the
    # home / WiFi-setup phase (which can block for several seconds).
