from __future__ import annotations

from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QApplication

from win_dot_panel.config import TABS, Settings
from win_dot_panel.ui.popup import PopupPanel


def test_open_source_tab_links_and_search_visibility(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    opened = []
    monkeypatch.setattr(QDesktopServices, "openUrl", lambda url: opened.append(url.toString()))
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings(last_tab="Open Source"))
    panel.show()
    app.processEvents()

    assert panel.pages.currentIndex() == TABS.index("Open Source")
    assert not panel.search.isVisible()
    panel.source_page.star_button.click()
    panel.source_page.issues_button.click()
    panel.source_page.docs_button.click()
    assert opened == [
        "https://github.com/elixpo/packages.elixpo",
        "https://github.com/elixpo/packages.elixpo/issues",
        "https://github.com/elixpo/packages.elixpo/tree/main/apps/win-dot-panel/docs",
    ]

    panel.select_tab(TABS.index("Emoji"), persist=False)
    assert panel.search.isVisible()
    panel.close()
