from __future__ import annotations

from PySide6.QtCore import QMimeData, Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QListView

from win_dot_panel.config import Settings
from win_dot_panel.text_picker.data import KAOMOJI, SYMBOLS
from win_dot_panel.ui.pages.text_picker_page import PAGE_SIZE
from win_dot_panel.ui.popup import PopupPanel


def test_kaomoji_search_and_insert_keeps_panel_open(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    inserted: list[str] = []
    monkeypatch.setattr(panel.inserter, "insert", lambda value: inserted.append(value) or True)
    panel.select_tab(2, persist=False)
    panel.show()

    panel.search.setText("shrug")
    assert panel.kaomoji_page.model.records[0].value == "¯\\_(ツ)_/¯"
    assert len(panel.kaomoji_page.model.records) > 1
    QTest.keyClick(panel.search, Qt.Key.Key_Return)
    assert inserted == ["¯\\_(ツ)_/¯"]
    assert panel.isVisible()

    panel.search.clear()
    panel.kaomoji_page.category.setCurrentText("Love")
    panel.search.setText("hug")
    assert {"Hug", "Open arms"} <= {item.name for item in panel.kaomoji_page.model.records}
    assert len(KAOMOJI) > 150
    view = panel.kaomoji_page.view
    assert view.viewMode() == QListView.ViewMode.IconMode
    panel.search.clear()
    panel.kaomoji_page.category.setCurrentText("All")
    QApplication.processEvents()
    short = view.visualRect(view.model().index(0, 0))
    long = view.visualRect(view.model().index(4, 0))
    assert short.width() < long.width()
    assert short.height() > 0 and long.height() > 0
    panel.close()


def test_kaomoji_rows_fill_available_width_after_resize_and_filter(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    panel.select_tab(2, persist=False)
    panel.show()
    view = panel.kaomoji_page.view

    def check_rows() -> None:
        app.processEvents()
        app.processEvents()
        rows: dict[int, list[int]] = {}
        for row in range(view.model().rowCount()):
            rect = view.visualRect(view.model().index(row, 0))
            rows.setdefault(rect.top(), []).append(rect.right() + 1)
        assert len(rows) > 1
        assert all(
            0 <= view.viewport().width() - max(right_edges) <= view.spacing() + 2
            for right_edges in rows.values()
        )

    for width in (480, 650, 480):
        panel.resize(width, 560)
        check_rows()

    panel.search.setText("happy")
    check_rows()
    panel.close()


def test_symbols_search_category_and_insertion_failure(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    monkeypatch.setattr(panel.inserter, "insert", lambda value: False)
    app.clipboard().setText("keep this")
    panel.select_tab(3, persist=False)
    panel.show()
    app.processEvents()

    assert len(SYMBOLS) > 3000
    assert len(panel.symbols_page.model.records) == PAGE_SIZE
    bar = panel.symbols_page.view.verticalScrollBar()
    bar.setValue(bar.maximum())
    app.processEvents()
    assert len(panel.symbols_page.model.records) > PAGE_SIZE
    for _ in range(20):
        if len(panel.symbols_page.model.records) == len(SYMBOLS):
            break
        bar.setValue(bar.maximum())
        app.processEvents()
    assert len(panel.symbols_page.model.records) == len(SYMBOLS)

    panel.search.setText("copyright")
    assert panel.symbols_page.model.records[0].value == "©"
    panel.symbols_page.select_current_or_first()
    assert app.clipboard().text() == "keep this"
    assert panel.hint.text() == "Could not insert here — focus an editable text field and reopen"

    panel.search.clear()
    panel.symbols_page.category.setCurrentText("Arrows")
    panel.search.setText("right arrow")
    assert "→" in [item.value for item in panel.symbols_page.model.records]
    panel.search.setText("copyright")
    assert panel.symbols_page.model.records == []
    panel.symbols_page.category.setCurrentText("Latin")
    panel.search.setText("e acute")
    assert "é" in [item.value for item in panel.symbols_page.model.records]
    panel.close()


def test_text_insertion_falls_back_to_previous_x_window(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())

    class FakeClipboard:
        def __init__(self):
            self.mime = QMimeData()
            self.mime.setText("previous clipboard")
            self.blocked = False

        def mimeData(self):
            return self.mime

        def setMimeData(self, mime, mode):
            self.mime = mime

        def setText(self, value, mode):
            self.mime = QMimeData()
            self.mime.setText(value)

        def signalsBlocked(self):
            return self.blocked

        def blockSignals(self, blocked):
            self.blocked = blocked

    clipboard = FakeClipboard()
    commands: list[list[str]] = []
    monkeypatch.setattr(panel.inserter, "insert", lambda value: False)
    panel.inserter.target_window = "4242"
    monkeypatch.setattr(panel, "_system_clipboard", lambda: clipboard)
    monkeypatch.setattr(
        "win_dot_panel.ui.popup.subprocess.run",
        lambda command, **kwargs: (
            commands.append(command) or type("Result", (), {"returncode": 0})()
        ),
    )

    assert panel._insert_text("🚀")
    assert clipboard.mime.text() == "🚀"
    assert clipboard.blocked
    generation = panel._paste_generation
    panel._finish_clipboard_paste(generation)

    assert clipboard.mime.text() == "previous clipboard"
    assert not clipboard.blocked
    assert commands == [
        ["xdotool", "windowactivate", "--sync", "4242"],
        [
            "xdotool",
            "key",
            "--window",
            "4242",
            "--clearmodifiers",
            "shift+Insert",
        ],
    ]
    panel.close()
