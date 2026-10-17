"""Drawing functions for Snake.

Every function takes the display + the slice of state it needs as
arguments — no module-level mutable state, no reaching into the App
object. Keeps the rendering layer easy to follow and means a
contributor adding (say) a new game-over screen only has to read
this file.
"""

from oreoOS import api, theme, widgets
from . import game as g

SW = api.SCREEN_W
SH = api.SCREEN_H


# ── asset loaders ───────────────────────────────────────────────────────

def load_bg():
    """Optional grid-arena bg sprite at apps/snake/assets/optimized/arena.
    Returns (data, w, h) or None — caller falls back to a solid card."""
    try:
        m = __import__("apps.snake.assets.optimized.arena", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def load_food():
    """Bamboo food sprite. Returns (bytearray, w, h) or None — caller
    draws a coloured rect instead."""
    try:
        m = __import__("apps.snake.assets.optimized.food", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


# ── arena + entities ────────────────────────────────────────────────────

def draw_arena(d, snake, food, food_sprite):
    """Tile the arena background, then stamp the food + snake on top."""
    bg = load_bg()
    if bg:
        data, bw, bh = bg
        y = g.ARENA_Y
        while y < g.ARENA_Y + g.ARENA_H:
            x = g.ARENA_X
            while x < g.ARENA_X + g.ARENA_W:
                d.blit(data, x, y, bw, bh)
                x += bw
            y += bh
    else:
        d.rect(g.ARENA_X, g.ARENA_Y, g.ARENA_W, g.ARENA_H,
               theme.CARD, fill=True)

    # Food — bamboo sprite if available, else coloured square.
    fc, fr = food
    fx, fy = g.ARENA_X + fc * g.CELL, g.ARENA_Y + fr * g.CELL
    if food_sprite:
        fdata, fw, fh = food_sprite
        d.blit(fdata,
               fx + (g.CELL - fw) // 2,
               fy + (g.CELL - fh) // 2,
               fw, fh)
    else:
        d.rect(fx + 1, fy + 1, g.CELL - 2, g.CELL - 2,
               theme.PRIMARY, fill=True)

    # Snake body — head brighter so the player can find it instantly.
    for i, (c, r) in enumerate(snake):
        color = theme.TEAL if i == 0 else theme.GREEN
        d.rect(g.ARENA_X + c * g.CELL + 1, g.ARENA_Y + r * g.CELL + 1,
               g.CELL - 2, g.CELL - 2, color, fill=True)


def dim_arena(d):
    """Translucent-looking dim overlay using sparse scanlines (every
    other row of black). Cheap, gives the world a faded look behind
    INTRO / PAUSE / OVER panels."""
    for y in range(g.ARENA_Y, g.ARENA_Y + g.ARENA_H, 2):
        d.rect(g.ARENA_X, y, g.ARENA_W, 1, api.rgb(0, 0, 0), fill=True)


# ── HUD + overlays ──────────────────────────────────────────────────────

def draw_hud(d, score_str):
    d.text(score_str, SW - len(score_str) * 16 - 6, 6, api.WHITE, scale=2)


def draw_intro(d, hi, blink):
    title = "SNAKE"
    d.text(title, (SW - len(title) * 24) // 2, 60, api.WHITE, scale=3)

    if hi:
        msg = "HIGH %d" % hi
        d.text(msg, (SW - len(msg) * 16) // 2, 104, theme.GOLD, scale=2)

    # Blink the prompt so it reads as a call-to-action.
    if int(blink * 2) % 2 == 0:
        msg = "Press A to start"
        d.text(msg, (SW - len(msg) * 16) // 2, 150, api.WHITE, scale=2)


def draw_paused(d, blink):
    panel_w, panel_h = 200, 76
    px = (SW - panel_w) // 2
    py = (SH - panel_h) // 2
    d.rect(px, py, panel_w, panel_h, theme.STATUS_BG, fill=True)
    d.rect(px, py, panel_w, 2,       theme.PRIMARY,   fill=True)
    d.text("PAUSED",
           px + (panel_w - 6 * 16) // 2, py + 14,
           api.WHITE, scale=2)
    if int(blink * 2) % 2 == 0:
        msg = "Press B to resume"
        d.text(msg, px + (panel_w - len(msg) * 8) // 2,
               py + 48, api.WHITE)


def draw_gameover(d, score, hi, new_hi, blink):
    """Full-width arcade-style kill-cam band. Crosses the entire arena
    so the GAME OVER message reads as a focal event, not a popup."""
    band_h = 120
    band_y = (SH - band_h) // 2
    d.rect(0, band_y,                SW, band_h, api.rgb(10, 14, 28), fill=True)
    d.rect(0, band_y,                SW, 3,      theme.PRIMARY,       fill=True)
    d.rect(0, band_y + band_h - 3,   SW, 3,      theme.PRIMARY,       fill=True)

    title = "GAME OVER"
    d.text(title, (SW - len(title) * 24) // 2, band_y + 14,
           api.WHITE, scale=3)

    score_s = "Score %d" % score
    if new_hi:
        note, note_c = "NEW HIGH!", theme.GOLD
    else:
        note   = "Best %d" % hi
        note_c = theme.GOLD if hi else theme.MUTED
    d.text(score_s, (SW - len(score_s) * 16) // 2, band_y + 52,
           api.WHITE, scale=2)
    d.text(note,    (SW - len(note)    * 16) // 2, band_y + 76,
           note_c, scale=2)

    if int(blink * 2) % 2 == 0:
        msg = "Press A to retry"
        d.text(msg, (SW - len(msg) * 8) // 2,
               band_y + band_h - 18, api.WHITE)
