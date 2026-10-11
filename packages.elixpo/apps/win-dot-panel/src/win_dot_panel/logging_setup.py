"""Application logging without clipboard content."""

from __future__ import annotations

import logging
import os
from pathlib import Path


def configure_logging() -> None:
    base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
    log_path = base / "win-dot-panel" / "win-dot-panel.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=log_path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
