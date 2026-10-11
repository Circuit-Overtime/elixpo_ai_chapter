from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

from win_dot_panel.config import Settings
from win_dot_panel.ui.popup import PopupPanel


def test_system_theme_updates_open_pages(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    original = QPalette(app.palette())
    panel = None
    try:
        light = QPalette(original)
        light.setColor(QPalette.ColorRole.Window, QColor("#f8f8f8"))
        app.setPalette(light)
        panel = PopupPanel(Settings(theme="system"))
        assert not panel._dark

        dark = QPalette(original)
        dark.setColor(QPalette.ColorRole.Window, QColor("#202020"))
        app.setPalette(dark)
        assert panel._dark
        assert panel.kaomoji_page.category.dark
        assert panel.symbols_page.view.itemDelegate().dark
        assert "#25262b" in panel.styleSheet()
    finally:
        if panel is not None:
            panel.close()
        app.setPalette(original)
