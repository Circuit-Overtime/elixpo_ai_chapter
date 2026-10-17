from __future__ import annotations

from PySide6.QtWidgets import QApplication

from win_dot_panel.config import Settings
from win_dot_panel.emoji.importer import ensure_emoji_dataset
from win_dot_panel.storage.database import open_database
from win_dot_panel.ui.popup import PopupPanel


def test_selection_inserts_emoji_and_keeps_panel_open(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    panel = PopupPanel(Settings(), ensure_emoji_dataset(connection))
    inserted = []
    monkeypatch.setattr(panel.inserter, "capture_focused_field", lambda: None)
    monkeypatch.setattr(panel.inserter, "insert", lambda value: inserted.append(value) or True)
    panel.show_panel()

    panel.emoji_page.set_query("rocket")
    assert panel.emoji_page.model.records[0].emoji == "🚀"
    panel.emoji_page.select_current_or_first()
    assert inserted == ["🚀"]
    assert panel.isVisible()

    panel.emoji_page.set_query("")
    assert panel.emoji_page.recent_heading.isVisible()
    assert panel.emoji_page.recent_model.records[0].emoji == "🚀"
    assert panel.emoji_page.grid.gridSize().width() == 52
    panel.resize(480, 560)
    QApplication.processEvents()
    assert panel.emoji_page.grid.viewport().width() // panel.emoji_page.grid.gridSize().width() == 8
    panel.emoji_page.category.setCurrentText("Recent")
    assert panel.emoji_page.model.records[0].emoji == "🚀"
    panel.close()
    connection.close()


def test_selection_preserves_clipboard_when_direct_insertion_is_unavailable(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    panel = PopupPanel(Settings(), ensure_emoji_dataset(connection))
    monkeypatch.setattr(panel.inserter, "insert", lambda value: False)
    app.clipboard().setText("keep this")

    panel.emoji_page.set_query("rocket")
    panel.emoji_page.select_current_or_first()
    assert app.clipboard().text() == "keep this"
    assert panel.hint.text() == "Could not insert here — focus an editable text field and reopen"
    panel.close()
    connection.close()
