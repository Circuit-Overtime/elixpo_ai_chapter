from __future__ import annotations

import os

from PySide6.QtCore import QEvent, QPoint, QRect, QSize, Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from win_dot_panel.config import Settings
from win_dot_panel.ui.platform import configure_window_platform
from win_dot_panel.ui.popup import PopupPanel, position_near_cursor


def test_popup_position_stays_near_cursor_and_inside_screen():
    area = QRect(100, 200, 1200, 800)
    size = QSize(540, 560)

    assert position_near_cursor(QPoint(200, 300), size, area) == QPoint(216, 316)
    assert position_near_cursor(QPoint(1250, 300), size, area) == QPoint(694, 316)
    assert position_near_cursor(QPoint(200, 950), size, area) == QPoint(216, 374)
    assert position_near_cursor(QPoint(1250, 950), size, area) == QPoint(694, 374)


def test_wayland_session_uses_xwayland_for_positioning(monkeypatch):
    monkeypatch.setenv("XDG_SESSION_TYPE", "wayland")
    monkeypatch.setenv("DISPLAY", ":0")
    monkeypatch.delenv("QT_QPA_PLATFORM", raising=False)
    configure_window_platform()
    assert os.environ["QT_QPA_PLATFORM"] == "xcb;wayland"

    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    configure_window_platform()
    assert os.environ["QT_QPA_PLATFORM"] == "offscreen"


def test_popup_can_be_dragged_by_handle(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    panel.show()
    app.processEvents()

    original = panel.pos()
    QTest.mousePress(panel.drag_handle, Qt.MouseButton.LeftButton, pos=QPoint(12, 7))
    QTest.mouseMove(panel.drag_handle, QPoint(52, 37))
    QTest.mouseRelease(panel.drag_handle, Qt.MouseButton.LeftButton, pos=QPoint(52, 37))

    assert panel.pos() == original + QPoint(40, 30)
    panel.close()


def test_popup_closes_when_window_deactivates(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    panel.show()
    app.processEvents()

    panel.event(QEvent(QEvent.Type.WindowDeactivate))
    app.processEvents()

    assert not panel.isVisible()
    panel.close()


def test_popup_has_explicit_close_button(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    panel = PopupPanel(Settings())
    panel.show()
    app.processEvents()

    panel.close_button.click()

    assert panel.close_button.accessibleName() == "Close panel"
    assert not panel.isVisible()
    panel.close()
