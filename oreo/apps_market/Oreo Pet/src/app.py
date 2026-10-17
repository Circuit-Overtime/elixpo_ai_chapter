"""Oreo Pet — Tamagotchi-style panda companion.

UI: panda centred on a soft bg, three "heart row" stats above (hunger /
happiness / health — 5 hearts each, filled vs empty), a speech-bubble
callout below showing the pet's current thought.

Decay is intentionally slow — you should feel like you're caring for a pet
on a *daily* routine. Each stat drops roughly 25 pts every 24 h idle.

Controls:
  A      feed   (+30 hunger,    spawns floating hearts)
  B      play   (+15 happiness, spawns floating hearts)
  C      sleep  (held — regen all stats slowly)
  HOME   apps drawer (OS default)
"""

import time
import oreoOS
from oreoOS import api
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

STATE_PATH = "apps/pet/state.txt"

# Per-second decay — slowed ~3× from the previous tune so the pet survives
# a normal multi-day on-off cadence without auto-starving. At 0.00045 pt/s
# a full hunger bar drains in roughly 60 hours of *foreground* time on the
# badge (the OS only ticks update() while the pet app is open). Combine
# with the badge being off most of the day and real-world feed frequency
# is about every 2–3 days.
DECAY_HUNGER = 0.00045
DECAY_HAPPY  = 0.00030
EAT_FACE_MS  = 1200      # show 'eat' expression for this long after feeding


# ─── helpers ─────────────────────────────────────────────────────────────────

def _load_state():
    """Read persisted (hunger, happy, health) from disk.

    First-launch / post-flash behaviour: state.txt does not exist yet (a
    deploy --clean wipes it; a fresh badge has never written it), so we
    return (100, 100, 100). The pet starts maxed-out and only decays
    while the user is actually looking at the app.

    Persisted state is preserved across power-cycles and reboots because
    state.txt sits on the regular filesystem partition — it survives
    until the user re-flashes with --clean.
    """
    try:
        with open(STATE_PATH) as f:
            a, b, c = f.read().strip().split(",")
            return (int(a), int(b), int(c))
    except Exception:
        return (100, 100, 100)

def _save_state(h, hp, hl):
    try:
        with open(STATE_PATH, "w") as f:
            f.write("%d,%d,%d" % (h, hp, hl))
    except Exception:
        pass

def _clamp(v):
    return max(0, min(100, int(v)))

def _upscale_sprite_2x(data, w, h):
    """Nearest-neighbour 2x of an RGB565 big-endian bytearray sprite.

    Used to render the panda BIG in the centre of the pet stage. Source
    sprites are 64x64; we cache the upscaled 128x128 buffer on the app
    instance so per-frame draw stays a single d.blit.
    """
    dw = w * 2
    dh = h * 2
    out = bytearray(dw * dh * 2)
    for y in range(h):
        src_row = y * w * 2
        dst_y0  = (y * 2) * dw * 2
        dst_y1  = dst_y0 + dw * 2
        for x in range(w):
            si = src_row + x * 2
            b0 = data[si]
            b1 = data[si + 1]
            di0 = dst_y0 + (x * 2) * 2
            di1 = dst_y1 + (x * 2) * 2
            out[di0]     = b0; out[di0 + 1] = b1
            out[di0 + 2] = b0; out[di0 + 3] = b1
            out[di1]     = b0; out[di1 + 1] = b1
            out[di1 + 2] = b0; out[di1 + 3] = b1
    return out, dw, dh


def _try_sprite(modpath):
    try:
        m = __import__(modpath, None, None, ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


# ─── heart particle (rises from panda when feeding/playing) ─────────────────

class _HeartParticle:
    __slots__ = ("x", "y0", "t", "max_t", "vx")
    def __init__(self, x, y, vx):
        self.x, self.y0, self.vx = x, y, vx
        self.t, self.max_t = 0.0, 0.9

    def update(self, dt):
        self.t += dt
        return self.t < self.max_t

    def draw(self, d, heart_sprite):
        if self.t >= self.max_t:
            return
        prog = self.t / self.max_t
        x    = int(self.x + self.vx * prog)
        y    = int(self.y0 - prog * 50)
        if heart_sprite:
            data, w, h = heart_sprite
            d.blit(data, x - w // 2, y - h // 2, w, h)
        else:
            # 5×5 pixel-heart fallback
            for dy, cols in [(0, (-2, -1, 1, 2)),
                              (1, range(-3, 4)),
                              (2, range(-3, 4)),
                              (3, range(-2, 3)),
                              (4, (-1, 0, 1))]:
                for dx in cols:
                    d.rect(x + dx, y + dy, 1, 1, theme.PRIMARY, fill=True)


def _draw_heart(d, x, y, filled=True):
    """Tiny 7×7 pixel heart — used for the stat rows."""
    col = theme.PRIMARY if filled else theme.MUTED2
    for dy, cols in [(0, (1, 2, 4, 5)),
                      (1, (0, 1, 2, 3, 4, 5, 6)),
                      (2, (0, 1, 2, 3, 4, 5, 6)),
                      (3, (1, 2, 3, 4, 5)),
                      (4, (2, 3, 4)),
                      (5, (3,))]:
        for dx in cols:
            d.rect(x + dx, y + dy, 1, 1, col, fill=True)


def _draw_speech_bubble(d, x, y, w, h, text, color):
    """Centred speech-bubble callout below the panda."""
    d.rect(x, y, w, h, theme.CARD, fill=True)
    d.rect(x, y, w, 2, theme.PRIMARY, fill=True)
    # Bottom-left "tail" — three short rows pointing at the panda
    d.rect(x + 12, y + h,     6, 2, theme.CARD,    fill=True)
    d.rect(x + 14, y + h + 2, 4, 2, theme.CARD,    fill=True)
    # Centred text
    tw = len(text) * 8
    d.text(text, x + (w - tw) // 2, y + (h - 8) // 2, color)


# ─── App ─────────────────────────────────────────────────────────────────────

class App(oreoOS.App):
    name         = "Oreo Pet"
    SHOW_LOADING = False

    def on_enter(self, os):
        self._os = os
        # Sprites — load once, then 2x upscale so the pet reads BIG in the
        # middle of the screen. Source sprites are 64x64; cached as 128x128
        # bytearrays so per-frame draw is a single blit.
        keys = ("happy", "hungry", "sad", "sleep", "eat")
        self._sprites = {}
        for k in keys:
            src = _try_sprite("apps.pet.assets.optimized.panda_" + k)
            if src:
                self._sprites[k] = _upscale_sprite_2x(*src)
        self._fallback  = _try_sprite("assets.sprites.optimized.mascot")
        self._heart_spr = _try_sprite("apps.pet.assets.optimized.heart")

        self._hunger, self._happy, self._health = _load_state()
        self._last_tick   = time.ticks_ms()
        self._last_save_t = time.ticks_ms()
        self._anim_t      = 0.0
        self._eat_left    = 0.0
        self._sleeping    = False
        self._hearts      = []
        self._dirty       = True

    def on_exit(self):
        _save_state(self._hunger, self._happy, self._health)

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            if self._hunger >= 95:
                self._happy = _clamp(self._happy - 3)
            else:
                self._hunger    = _clamp(self._hunger + 30)
                self._eat_left  = EAT_FACE_MS / 1000.0
                self._spawn_hearts(3)
        elif btn == api.BTN_B:
            if self._hunger > 15:
                self._happy  = _clamp(self._happy  + 15)
                self._hunger = _clamp(self._hunger - 10)
                self._spawn_hearts(2)
        elif btn == api.BTN_C:
            self._sleeping = True
        self._dirty = True

    def on_button_release(self, btn):
        if btn == api.BTN_C and self._sleeping:
            self._sleeping = False
            self._dirty = True

    def _spawn_hearts(self, n):
        # Hearts emit from above the pet's head — roughly the top of the
        # 128 px sprite slot in the middle of the screen.
        spawn_y = widgets.HEADER_H + 60
        for i in range(n):
            vx = (i - n // 2) * 14
            self._hearts.append(_HeartParticle(SW // 2, spawn_y, vx))

    def update(self, dt):
        now      = time.ticks_ms()
        wall_dt  = time.ticks_diff(now, self._last_tick) / 1000.0
        self._last_tick = now
        self._anim_t   += dt
        self._eat_left  = max(0.0, self._eat_left - dt)

        # Decay (much slower when asleep)
        rate = 0.3 if self._sleeping else 1.0
        self._hunger = _clamp(self._hunger - DECAY_HUNGER * wall_dt * 100 * rate)
        self._happy  = _clamp(self._happy  - DECAY_HAPPY  * wall_dt * 100 * rate)
        if self._sleeping:
            self._health = _clamp(self._health + 0.05 * wall_dt)
        else:
            worst        = min(self._hunger, self._happy)
            target       = (self._health + worst) // 2
            self._health = _clamp(target)

        self._hearts = [p for p in self._hearts if p.update(dt)]
        self._dirty  = True

        # Persist every ~10 s so an unexpected power-cycle doesn't lose
        # progress (on_exit also saves, but only when the user HOMEs out
        # of the app cleanly — and the badge can brown out mid-play).
        if time.ticks_diff(now, self._last_save_t) > 10000:
            _save_state(self._hunger, self._happy, self._health)
            self._last_save_t = now

    # ── sprite + thought picker ─────────────────────────────────────────
    def _pick_state(self):
        if self._sleeping:        return "sleep", "zZz..."
        if self._eat_left > 0:    return "eat",   "Yum!"
        if self._hunger < 35:     return "hungry","I'm hungry!"
        if self._happy < 35:      return "sad",   "Play with me?"
        if self._hunger > 90:     return "happy", "So full!"
        if self._happy  > 90:     return "happy", "Heehee!"
        return "happy", "I'm doing great"

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "OREO PET")
        widgets.draw_hint  (d, "A=feed  B=play  C=sleep")

        key, thought = self._pick_state()

        # ── compact stat strip across the top ─────────────────────────
        # Three columns: label + segmented bar + % readout. Reads at a
        # glance without dominating the screen — the pet is the hero.
        strip_y    = widgets.HEADER_H + 4
        strip_h    = 28
        col_w      = SW // 3
        for i, (label, val, color) in enumerate([
                ("Hunger",    self._hunger, theme.PRIMARY),
                ("Happiness", self._happy,  theme.TEAL),
                ("Health",    self._health, theme.GOLD)]):
            cx = col_w * i
            d.text(label, cx + 6, strip_y, theme.MUTED)
            # Segmented bar — 10 cells, filled proportionally to val/100.
            bar_y = strip_y + 12
            bar_x = cx + 6
            bar_w = col_w - 12
            cell  = (bar_w - 9) // 10
            filled = val // 10
            for k in range(10):
                fx = bar_x + k * (cell + 1)
                col = color if k < filled else theme.MUTED2
                d.rect(fx, bar_y, cell, 6, col, fill=True)
            # % readout under the bar.
            pct = "%d%%" % val
            d.text(pct, cx + col_w - len(pct) * 8 - 6, bar_y + 8, theme.MUTED)

        # ── BIG centred panda ─────────────────────────────────────────
        # 128x128 upscaled sprite — fills the middle band of the screen
        # so the pet itself is the focal point.
        stage_top = strip_y + strip_h + 4
        stage_bot = SH - widgets.HINT_H - 32     # leave room for thought
        sprite    = self._sprites.get(key) or self._fallback
        bob       = int(3 * (abs((self._anim_t * 2) % 2 - 1)))
        if sprite:
            data, mw, mh = sprite
            px = (SW - mw) // 2
            py = stage_top + (stage_bot - stage_top - mh) // 2 + bob
            d.blit(data, px, py, mw, mh)
        else:
            d.rect((SW - 128) // 2,
                   stage_top + (stage_bot - stage_top - 128) // 2 + bob,
                   128, 128, theme.PRIMARY, fill=True)

        # ── heart particles in front of the panda ─────────────────────
        for p in self._hearts:
            p.draw(d, self._heart_spr)

        # ── thought callout at the bottom ─────────────────────────────
        bw = max(120, len(thought) * 8 + 28)
        bx = (SW - bw) // 2
        by = SH - widgets.HINT_H - 24
        _draw_speech_bubble(d, bx, by, bw, 18, thought, theme.PRIMARY)

        self._dirty = False
