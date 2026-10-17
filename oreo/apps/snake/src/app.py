"""The Snake App class — pure orchestration.

This file is intentionally small. It does three things:
  1. Holds the lifecycle hooks the OS calls (on_enter / update /
     draw / on_button_press).
  2. Owns the state-machine variable that decides which screen
     gets drawn this frame.
  3. Bridges between game.step() (pure logic) and render.* (pure
     drawing).

When you add a new feature to Snake, ask yourself: is it logic,
rendering, or persistence? Then it goes in game.py, render.py, or
highscore.py respectively — not here. Keeping app.py thin is the
whole reason for the src/ split.
"""

import oreoOS
from oreoOS import api, theme, widgets

from . import game, render
from . import highscore


class App(oreoOS.App):
    name = "Snake"

    # ── lifecycle ──────────────────────────────────────────────────

    def on_enter(self, os):
        self._os     = os
        self._state  = game.INTRO
        self._hi     = highscore.load()
        self._new_hi = False
        self._blink  = 0.0
        self._dirty  = True
        # INTRO state runs render.draw_arena, which references
        # snake + food — initialise both BEFORE the first frame so we
        # don't AttributeError before _start() ever runs.
        self._snake     = game.initial_snake()
        self._food      = (game.COLS // 4, game.ROWS // 2)
        self._dir       = (1, 0)
        self._next_dir  = self._dir
        self._step_left = game.STEP_SEC0
        self._step_sec  = game.STEP_SEC0
        self._score     = 0
        # Cache the food sprite once — chroma-keyed so the arena tile
        # shows through around the bamboo.
        self._food_sprite = render.load_food()

    def _start(self):
        """Transition INTRO → PLAY with a fresh snake."""
        self._snake     = game.initial_snake()
        self._dir       = (1, 0)
        self._next_dir  = self._dir
        self._food      = game.random_food(self._snake)
        self._step_left = game.STEP_SEC0
        self._step_sec  = game.STEP_SEC0
        self._score     = 0
        self._state     = game.PLAY
        self._dirty     = True

    def _die(self):
        """Transition PLAY → OVER, possibly saving a new hi-score."""
        if self._score > self._hi:
            self._hi = self._score
            self._new_hi = True
            highscore.save(self._hi)
        else:
            self._new_hi = False
        self._state = game.OVER
        self._dirty = True

    # ── input ──────────────────────────────────────────────────────

    def on_button_press(self, btn):
        if self._state == game.INTRO and btn == api.BTN_A:
            self._start(); return
        if self._state == game.OVER and btn == api.BTN_A:
            self._state = game.INTRO; self._dirty = True; return
        # B toggles pause while playing or already paused.
        if btn == api.BTN_B:
            if self._state == game.PLAY:
                self._state = game.PAUSE; self._dirty = True; return
            if self._state == game.PAUSE:
                self._state = game.PLAY;  self._dirty = True; return
        if self._state != game.PLAY:
            return
        # No 180° reversals — only accept turns perpendicular to the
        # current direction.
        dx, dy = self._dir
        if   btn == api.BTN_LEFT  and dx ==  0: self._next_dir = (-1,  0)
        elif btn == api.BTN_RIGHT and dx ==  0: self._next_dir = ( 1,  0)
        elif btn == api.BTN_UP    and dy ==  0: self._next_dir = ( 0, -1)
        elif btn == api.BTN_DOWN  and dy ==  0: self._next_dir = ( 0,  1)

    # ── tick ───────────────────────────────────────────────────────

    def update(self, dt):
        self._blink += dt
        if self._state != game.PLAY:
            return
        self._step_left -= dt
        if self._step_left > 0:
            return
        self._step_left += self._step_sec

        # Pure function does the work — App just dispatches the result.
        self._dir = self._next_dir
        new_snake, new_food, new_score, new_step, _ate, died = game.step(
            self._snake, self._dir, self._food, self._score,
            self._step_sec,
        )
        if died:
            self._die()
            return
        self._snake    = new_snake
        self._food     = new_food
        self._score    = new_score
        self._step_sec = new_step
        self._dirty    = True

    # ── render ─────────────────────────────────────────────────────

    def draw(self, d):
        # Render every frame for the blinking prompts; the arena is
        # small enough that a full redraw is cheap.
        d.clear(theme.BG)
        widgets.draw_header(d, "SNAKE")

        if self._state == game.INTRO:
            render.draw_arena(d, self._snake, self._food, self._food_sprite)
            render.dim_arena(d)
            render.draw_intro(d, self._hi, self._blink)
        elif self._state == game.PLAY:
            render.draw_arena(d, self._snake, self._food, self._food_sprite)
            render.draw_hud(d, "%d" % self._score)
        elif self._state == game.PAUSE:
            render.draw_arena(d, self._snake, self._food, self._food_sprite)
            render.draw_hud(d, "%d" % self._score)
            render.dim_arena(d)
            render.draw_paused(d, self._blink)
        elif self._state == game.OVER:
            render.draw_arena(d, self._snake, self._food, self._food_sprite)
            render.draw_hud(d, "%d" % self._score)
            render.dim_arena(d)
            render.draw_gameover(d, self._score, self._hi,
                                  self._new_hi, self._blink)

        widgets.draw_hint(d, "A=start  B=pause  arrows=move")
