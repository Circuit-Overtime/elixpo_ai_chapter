from __future__ import annotations

import sqlite3

import pytest

from win_dot_panel.emoji.models import EmojiRecord
from win_dot_panel.storage.database import database_path, open_database
from win_dot_panel.storage.migrations import UnsupportedSchemaError
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository
from win_dot_panel.storage.repositories.emoji_repository import EmojiRepository
from win_dot_panel.storage.repositories.settings_repository import SettingsRepository


def test_database_uses_xdg_path_and_survives_reopen(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    path = database_path()
    assert path == tmp_path / "win-dot-panel" / "panel.db"

    connection = open_database()
    SettingsRepository(connection).set("theme", "dark")
    assert (
        connection.execute("SELECT value FROM metadata WHERE key = 'schema_version'").fetchone()[0]
        == "4"
    )
    connection.close()

    reopened = open_database()
    assert SettingsRepository(reopened).get("theme") == "dark"
    reopened.close()


def test_unknown_schema_is_not_replaced(tmp_path):
    path = tmp_path / "panel.db"
    connection = open_database(path)
    SettingsRepository(connection).set("keep", "this data")
    with connection:
        connection.execute("UPDATE metadata SET value = '99' WHERE key = 'schema_version'")
    connection.close()

    with pytest.raises(UnsupportedSchemaError):
        open_database(path)

    existing = sqlite3.connect(path)
    assert (
        existing.execute("SELECT value FROM settings WHERE key = 'keep'").fetchone()[0]
        == "this data"
    )
    existing.close()


def test_incomplete_schema_is_not_recreated(tmp_path):
    path = tmp_path / "panel.db"
    connection = open_database(path)
    with connection:
        connection.execute("DROP TABLE settings")
    connection.close()

    with pytest.raises(UnsupportedSchemaError, match="incomplete"):
        open_database(path)


def test_clipboard_deduplication_pinning_and_retention(tmp_path):
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    first = repository.record_text("first", "hash-one", timestamp=1, history_limit=1)
    assert repository.set_pinned(first.id, True)

    second = repository.record_text("second", "hash-two", timestamp=2, history_limit=1)
    third = repository.record_text("third", "hash-three", timestamp=3, history_limit=1)
    assert repository.get(second.id) is None
    assert [item.id for item in repository.list_recent()] == [first.id, third.id]

    duplicate = repository.record_text("third", "hash-three", timestamp=4, history_limit=1)
    assert duplicate.id == third.id
    assert duplicate.use_count == 2
    assert duplicate.last_used_at == 4
    assert repository.clear() == 1
    assert [item.id for item in repository.list_recent()] == [first.id]
    assert repository.clear(include_pinned=True) == 1
    connection.close()


def test_emoji_usage_and_database_settings(tmp_path):
    connection = open_database(tmp_path / "panel.db")
    emoji = EmojiRepository(connection)
    emoji.insert_many([EmojiRecord(id=1, emoji="🚀", name="rocket")])
    emoji.record_usage(1, timestamp=10)
    emoji.record_usage(1, timestamp=20)
    assert emoji.list_recent()[0].name == "rocket"
    assert (
        connection.execute("SELECT use_count FROM emoji_usage WHERE emoji_id = 1").fetchone()[0]
        == 2
    )

    settings = SettingsRepository(connection)
    assert settings.get("missing", "fallback") == "fallback"
    settings.set("history_enabled", "true")
    assert settings.get("history_enabled") == "true"
    assert settings.delete("history_enabled")
    connection.close()
