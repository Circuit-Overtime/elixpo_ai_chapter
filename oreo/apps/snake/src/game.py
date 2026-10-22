"""Pure game logic + arena geometry constants.

This module has zero drawing code and zero OS hooks — it only knows
about the snake's state and how to evolve it. That separation is the
whole point of the src/ split: you can unit-test these functions on a
laptop, and a contributor reading game.py never has to scroll past
framebuffer calls to find the speed-up rule.
"""

from oreoOS import api, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

# Arena geometry — derived from the badge screen and the standard
# chrome bars (header + hint). One source of truth so render.py
# and game.py agree on where the playfield is.
CELL    = 10
ARENA_X = 0
ARENA_Y = widgets.HEADER_H + 2
ARENA_W = SW
ARENA_H = SH - widgets.HEADER_H - widgets.HINT_H - 4
COLS    = ARENA_W // CELL
ROWS    = ARENA_H // CELL

# Initial step interval. Snake gets faster as it eats; floor enforced
# in step() so the game stays playable even at very long lengths.
STEP_SEC0 = 0.16
STEP_FLOOR = 0.06
STEP_DECAY = 0.97

# State-machine constants. Defined here (not as an Enum) because
# MicroPython doesn't ship enum and a plain tuple of ints is the
# idiomatic way to do this on the badge.
INTRO, PLAY, OVER, PAUSE = 1, 2, 3, 4


# LCG so we don't depend on `random` (not in the MP build we ship).
# Module-level seed so callers don't have to thread state through.
_seed = 1


def rand():
    """Linear-congruential RNG. Returns a non-negative int."""
    global _seed
    _seed = (_seed * 1103515245 + 12345) & 0x7FFFFFFF
    return _seed


def random_food(snake):
    """Pick a cell that the snake doesn't currently occupy. Loops until
    one is found — fine because the arena is far larger than any
    plausible snake."""
    snake_set = set(snake)
    while True:
        c = rand() % COLS
        r = rand() % ROWS
        if (c, r) not in snake_set:
            return (c, r)


def initial_snake():
    """The starting snake: four cells long, facing right, centred in
    the arena. Returned head-first so snake[0] is always the head."""
    mid_c = COLS // 2
    mid_r = ROWS // 2
    return [(mid_c - i, mid_r) for i in range(4)]


def step(snake, direction, food, score, step_sec):
    """Advance the snake one cell in `direction`. Returns a 6-tuple:

        (new_snake, new_food, new_score, new_step_sec, ate, died)

    The caller (App.update) inspects `died` to switch into OVER state,
    and `ate` if it wants to play a sound or flash a particle effect.

    Pure function — no I/O, no globals, no rendering. Easy to test.
    """
    dx, dy = direction
    hc, hr = snake[0]
    nc, nr = hc + dx, hr + dy

    # Wall collision.
    if nc < 0 or nc >= COLS or nr < 0 or nr >= ROWS:
        return snake, food, score, step_sec, False, True
    # Self collision.
    if (nc, nr) in snake:
        return snake, food, score, step_sec, False, True

    new_snake = [(nc, nr)] + snake
    if (nc, nr) == food:
        new_food  = random_food(new_snake)
        new_score = score + 1
        # Speed up by STEP_DECAY each food until STEP_FLOOR.
        new_step  = max(STEP_FLOOR, step_sec * STEP_DECAY)
        return new_snake, new_food, new_score, new_step, True, False
    # Didn't eat: drop the tail so length is unchanged.
    new_snake.pop()
    return new_snake, food, score, step_sec, False, False
