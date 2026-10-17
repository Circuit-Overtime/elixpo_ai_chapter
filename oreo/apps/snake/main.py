"""Snake — classic grid snake.

This file is intentionally tiny. The launcher loads `apps.snake.main`
and reads `App` off it — so every app must expose an `App` class
here, but the actual implementation lives under `src/` for
modularity:

    src/app.py        the lifecycle (on_enter / update / draw / input)
    src/game.py       pure game logic + arena geometry
    src/render.py     drawing functions
    src/highscore.py  persistent best-score I/O

See docs/apps on the website for the convention.
"""

from .src.app import App

# Keep `App` named at module scope so the launcher's
# `__import__("apps.snake.main", None, None, ["App"])` finds it.
__all__ = ["App"]
