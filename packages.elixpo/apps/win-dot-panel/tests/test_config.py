from __future__ import annotations

import json
import stat

import pytest

from win_dot_panel.config import Settings


def test_settings_round_trip(tmp_path):
    path = tmp_path / "config" / "config.json"
    settings = Settings(
        last_tab="Symbols",
        theme="dark",
        history_limit=50,
        portal_restore_token="saved-token",
    )

    settings.save(path)

    assert Settings.load(path) == settings
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


@pytest.mark.parametrize("value", [0, -1, True, "500"])
def test_invalid_history_limit_is_rejected(tmp_path, value):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"history_limit": value}), encoding="utf-8")

    with pytest.raises(ValueError, match="history_limit"):
        Settings.load(path)


def test_invalid_portal_restore_token_is_rejected(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"portal_restore_token": 42}), encoding="utf-8")

    with pytest.raises(TypeError, match="portal_restore_token"):
        Settings.load(path)
