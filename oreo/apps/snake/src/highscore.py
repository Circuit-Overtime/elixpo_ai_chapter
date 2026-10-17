"""Persistent hi-score storage for Snake.

Lives in its own module so the app code never deals with file paths
directly — useful as a teaching example of how to keep I/O isolated
from game logic.
"""

HISCORE_PATH = "apps/snake/hiscore.txt"


def load():
    """Read the current hi-score off flash. Returns 0 on first run or
    if the file is missing/corrupt — never raises."""
    try:
        with open(HISCORE_PATH) as f:
            return int(f.read().strip() or "0")
    except Exception:
        return 0


def save(value):
    """Persist a new hi-score. Silently ignores write failures (full
    flash, read-only mount) so the game keeps running."""
    try:
        with open(HISCORE_PATH, "w") as f:
            f.write(str(value))
    except Exception:
        pass
