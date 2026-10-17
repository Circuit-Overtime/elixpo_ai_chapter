"""Open the local SQLite database at the XDG data path."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from win_dot_panel.storage.migrations import migrate


def database_path() -> Path:
    base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "win-dot-panel" / "panel.db"


def open_database(path: Path | None = None) -> sqlite3.Connection:
    target = path or database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        migrate(connection)
    except Exception:
        connection.close()
        raise
    return connection
