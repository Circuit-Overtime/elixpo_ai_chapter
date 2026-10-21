"""Small key/value settings backed by the application database."""

from __future__ import annotations

import sqlite3


class SettingsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def get(self, key: str, default: str | None = None) -> str | None:
        row = self.connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row[0] if row is not None else default

    def set(self, key: str, value: str) -> None:
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )

    def delete(self, key: str) -> bool:
        with self.connection:
            result = self.connection.execute("DELETE FROM settings WHERE key = ?", (key,))
        return result.rowcount > 0
