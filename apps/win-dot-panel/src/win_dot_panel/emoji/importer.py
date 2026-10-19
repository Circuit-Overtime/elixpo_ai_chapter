"""Import the bundled offline emoji dataset once per data version."""

from __future__ import annotations

import json
import sqlite3
from importlib.resources import files

from win_dot_panel.emoji.models import EmojiRecord
from win_dot_panel.storage.repositories.emoji_repository import EmojiRepository
from win_dot_panel.storage.repositories.settings_repository import SettingsRepository

BUNDLED_EMOJI_VERSION = "18.0"


def ensure_emoji_dataset(connection: sqlite3.Connection) -> EmojiRepository:
    repository = EmojiRepository(connection)
    settings = SettingsRepository(connection)
    if settings.get("emoji_dataset_version") == BUNDLED_EMOJI_VERSION:
        return repository
    resource = files("win_dot_panel.resources").joinpath("emoji.json")
    payload = json.loads(resource.read_text(encoding="utf-8"))
    if payload["version"] != BUNDLED_EMOJI_VERSION:
        raise ValueError("Bundled emoji version does not match importer")
    repository.insert_many(EmojiRecord(**record) for record in payload["emoji"])
    settings.set("emoji_dataset_version", BUNDLED_EMOJI_VERSION)
    return repository
