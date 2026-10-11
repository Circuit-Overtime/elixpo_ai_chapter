from __future__ import annotations

import sqlite3
from importlib.resources import files

from win_dot_panel.emoji.importer import ensure_emoji_dataset
from win_dot_panel.storage.database import open_database
from win_dot_panel.storage.repositories.emoji_repository import EmojiRepository


def test_version_one_database_migrates_without_losing_data(tmp_path):
    path = tmp_path / "panel.db"
    connection = sqlite3.connect(path)
    schema = files("win_dot_panel.storage").joinpath("schema.sql").read_text(encoding="utf-8")
    connection.executescript(schema)
    connection.execute("INSERT INTO settings (key, value) VALUES ('keep', 'yes')")
    connection.commit()
    connection.close()

    migrated = open_database(path)
    assert migrated.execute("SELECT value FROM settings WHERE key = 'keep'").fetchone()[0] == "yes"
    assert (
        migrated.execute("SELECT value FROM metadata WHERE key = 'schema_version'").fetchone()[0]
        == "4"
    )
    migrated.close()


def test_bundled_emoji_search_categories_and_recents(tmp_path):
    path = tmp_path / "panel.db"
    connection = open_database(path)
    repository = ensure_emoji_dataset(connection)
    assert connection.execute("SELECT COUNT(*) FROM emoji").fetchone()[0] > 3000
    assert repository.search("rocket")[0].emoji == "🚀"
    assert any("technologist" in item.name for item in repository.search("developer"))
    assert repository.search("🚀")[0].name == "rocket"
    assert repository.search('" OR emoji_search MATCH "')[0:1] == []
    assert "Smileys & Emotion" in repository.list_categories()
    assert repository.list_category("Smileys & Emotion", limit=1)[0].emoji == "😀"

    rocket = repository.search("rocket")[0]
    repository.record_usage(rocket.id, timestamp=10)
    connection.close()

    reopened = open_database(path)
    repository = ensure_emoji_dataset(reopened)
    assert repository.list_recent()[0].emoji == "🚀"
    assert reopened.execute("SELECT COUNT(*) FROM emoji").fetchone()[0] > 3000
    reopened.close()


def test_existing_recent_emoji_order_survives_migration(tmp_path):
    path = tmp_path / "panel.db"
    connection = open_database(path)
    repository = ensure_emoji_dataset(connection)
    rocket = repository.search("rocket")[0]
    smile = repository.search("grinning face")[0]
    repository.record_usage(rocket.id, timestamp=100)
    repository.record_usage(smile.id, timestamp=200)
    with connection:
        connection.execute("UPDATE metadata SET value = '3' WHERE key = 'schema_version'")
        connection.execute("DROP INDEX idx_emoji_usage_recent")
        connection.execute("CREATE INDEX idx_emoji_usage_recent ON emoji_usage(last_used_at DESC)")
    connection.close()

    migrated = open_database(path)
    recent = EmojiRepository(migrated).list_recent()
    assert [item.id for item in recent[:2]] == [smile.id, rocket.id]
    assert (
        migrated.execute(
            "SELECT last_used_at FROM emoji_usage WHERE emoji_id = ?", (smile.id,)
        ).fetchone()[0]
        == 200000000000
    )
    migrated.close()
