from __future__ import annotations

from PySide6.QtCore import QBuffer, QIODevice, Qt
from PySide6.QtGui import QColor, QImage
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from win_dot_panel.clipboard.capture import ClipboardCapture
from win_dot_panel.config import Settings
from win_dot_panel.storage.database import open_database
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository
from win_dot_panel.ui.popup import PopupPanel


def test_clipboard_page_search_manage_and_pagination(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    for index in range(35):
        repository.record_text(f"note {index}", f"hash-{index}", timestamp=index, history_limit=100)

    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    page = panel.clipboard_page
    assert len(page.model.records) == 30
    assert page.has_more
    page.load_more()
    assert len(page.model.records) == 35
    assert not page.has_more

    page.set_query("note 17")
    assert len(page.model.records) == 1
    item_id = page.model.records[0].id
    page.list.setCurrentIndex(page.model.index(0, 0))
    page.toggle_pin()
    assert repository.get(item_id).is_pinned
    assert not hasattr(page, "pin_button")

    page.copy_current()
    assert app.clipboard().text() == "note 17"

    page.set_query("note 18")
    page.list.setCurrentIndex(page.model.index(0, 0))
    deleted_id = page.model.records[0].id
    page.delete_current()
    assert repository.get(deleted_id) is None

    page.clear_button.click()
    assert page.clear_button.text() == "Confirm clear"
    assert repository.get(item_id) is not None
    page.clear_button.click()
    assert repository.get(item_id) is not None
    assert [item.id for item in repository.list_recent()] == [item_id]
    panel.close()
    connection.close()


def test_clipboard_page_inserts_full_text_after_loading_only_a_preview(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    content = "start " + "x" * 500 + " ending"
    repository.record_text(content, "long-hash", timestamp=1, history_limit=100)
    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    page = panel.clipboard_page

    assert len(page.model.records[0].preview) == 240
    page.set_query("ending")
    assert len(page.model.records) == 1
    inserted = []
    monkeypatch.setattr(panel.inserter, "insert", lambda value: inserted.append(value) or True)
    panel.show()
    app.processEvents()
    QTest.keyClick(page.list, Qt.Key.Key_Return)
    assert inserted == [content]
    assert app.clipboard().text() != content
    assert not panel.isVisible()
    panel.close()
    connection.close()


def test_clipboard_text_keeps_panel_open_when_no_caret_was_captured(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    repository.record_text("cannot insert", "hash", timestamp=1, history_limit=10)
    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    monkeypatch.setattr(panel.inserter, "insert", lambda value: False)
    panel.show()
    app.processEvents()

    panel.clipboard_page.activate_current()

    assert panel.isVisible()
    assert panel.hint.text() == "Could not insert here — focus an editable text field and reopen"
    panel.close()
    connection.close()


def test_clipboard_page_image_menu_copies_screenshot(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    image = QImage(4, 4, QImage.Format.Format_ARGB32)
    image.fill(QColor("blue"))
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    assert image.save(buffer, "PNG")
    assert ClipboardCapture(repository, history_limit=10).capture_image(
        bytes(buffer.data()), "image/png"
    )
    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    page = panel.clipboard_page
    assert len(page.model.records) == 1
    assert page.model.records[0].content_type == "image"
    page.list.setCurrentIndex(page.model.index(0, 0))
    panel.show()
    app.processEvents()
    page.show_item_menu(page.model.index(0, 0), page.list.mapToGlobal(page.list.rect().center()))
    app.processEvents()
    assert panel.isVisible()
    assert page._item_menu.isVisible()
    page._item_menu.actions()[0].trigger()
    page._item_menu.hide()
    assert app.clipboard().image().pixelColor(0, 0) == QColor("blue")
    panel.close()
    connection.close()


def test_clipboard_image_activation_pastes_on_x11(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    monkeypatch.setenv("XDG_SESSION_TYPE", "x11")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    image = QImage(4, 4, QImage.Format.Format_ARGB32)
    image.fill(QColor("green"))
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    assert image.save(buffer, "PNG")
    assert ClipboardCapture(repository, history_limit=10).capture_image(
        bytes(buffer.data()), "image/png"
    )
    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    monkeypatch.setattr("win_dot_panel.ui.popup.shutil.which", lambda name: "/usr/bin/xdotool")
    commands = []
    monkeypatch.setattr(panel, "_paste_image", lambda command: commands.append(command))
    panel.show()
    panel.clipboard_page.activate_current()
    QTest.qWait(150)
    assert app.clipboard().image().pixelColor(0, 0) == QColor("green")
    assert commands == [["xdotool", "key", "--clearmodifiers", "ctrl+v"]]
    assert not panel.isVisible()
    panel.close()
    connection.close()


def test_clipboard_single_click_inserts_and_menu_actions_use_clicked_card(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    first = repository.record_text("first", "first", timestamp=1, history_limit=10)
    second = repository.record_text("second", "second", timestamp=2, history_limit=10)
    panel = PopupPanel(Settings(), clipboard_repository=repository)
    panel.select_tab(1, persist=False)
    page = panel.clipboard_page
    inserted = []
    monkeypatch.setattr(panel.inserter, "insert", lambda value: inserted.append(value) or True)
    page.list.show()
    app.processEvents()
    first_index = next(
        page.model.index(row, 0)
        for row, record in enumerate(page.model.records)
        if record.id == first.id
    )
    QTest.mouseClick(
        page.list.viewport(),
        Qt.MouseButton.LeftButton,
        pos=page.list.visualRect(first_index).center(),
    )
    assert inserted == ["first"]

    second_index = next(
        page.model.index(row, 0)
        for row, record in enumerate(page.model.records)
        if record.id == second.id
    )
    page.show_item_menu(second_index, page.list.mapToGlobal(page.list.rect().center()))
    page._item_menu.actions()[1].trigger()
    page._item_menu.hide()
    assert repository.get(second.id).is_pinned
    assert not repository.get(first.id).is_pinned
    assert inserted == ["first"]
    panel.close()
    connection.close()
