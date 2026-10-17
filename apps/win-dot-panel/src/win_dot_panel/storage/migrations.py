"""Versioned SQLite schema initialization; never replaces existing user data."""

from __future__ import annotations

import sqlite3
from importlib.resources import files

SCHEMA_VERSION = 4
REQUIRED_TABLES = frozenset(
    {"metadata", "clipboard_items", "emoji", "emoji_usage", "settings", "emoji_search"}
)


class UnsupportedSchemaError(RuntimeError):
    """The database needs a migration this version does not know how to perform."""


def migrate(connection: sqlite3.Connection) -> None:
    existing = {
        row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    if "metadata" not in existing:
        if existing - {"sqlite_sequence"}:
            raise UnsupportedSchemaError("Existing database tables have no schema version")
        schema = files("win_dot_panel.storage").joinpath("schema.sql").read_text(encoding="utf-8")
        try:
            connection.executescript(f"BEGIN IMMEDIATE;\n{schema}\nCOMMIT;")
        except sqlite3.Error:
            connection.rollback()
            raise
        version = 1
    else:
        row = connection.execute(
            "SELECT value FROM metadata WHERE key = 'schema_version'"
        ).fetchone()
        if row is None:
            raise UnsupportedSchemaError("Database has no schema version")
        try:
            version = int(row[0])
        except ValueError as error:
            raise UnsupportedSchemaError("Database schema version is invalid") from error

    if version == 1:
        migration = (
            files("win_dot_panel.storage")
            .joinpath("migration_002_emoji_fts.sql")
            .read_text(encoding="utf-8")
        )
        try:
            connection.executescript(f"BEGIN IMMEDIATE;\n{migration}\nCOMMIT;")
        except sqlite3.Error:
            connection.rollback()
            raise
        version = 2
        existing = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }

    if version == 2:
        migration = (
            files("win_dot_panel.storage")
            .joinpath("migration_003_clipboard_images.sql")
            .read_text(encoding="utf-8")
        )
        try:
            connection.executescript(f"BEGIN IMMEDIATE;\n{migration}\nCOMMIT;")
        except sqlite3.Error:
            connection.rollback()
            raise
        version = 3

    if version == 3:
        migration = (
            files("win_dot_panel.storage")
            .joinpath("migration_004_emoji_recents.sql")
            .read_text(encoding="utf-8")
        )
        try:
            connection.executescript(f"BEGIN IMMEDIATE;\n{migration}\nCOMMIT;")
        except sqlite3.Error:
            connection.rollback()
            raise
        version = 4

    if version != SCHEMA_VERSION:
        raise UnsupportedSchemaError(
            f"Database schema version {version} is unsupported; expected {SCHEMA_VERSION}"
        )
    if missing := REQUIRED_TABLES - existing:
        raise UnsupportedSchemaError(f"Database schema is incomplete: {', '.join(sorted(missing))}")
