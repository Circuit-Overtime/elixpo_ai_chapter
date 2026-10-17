from __future__ import annotations

from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtWidgets import QApplication

from win_dot_panel.config import Settings
from win_dot_panel.ui.popup import PopupPanel


class FakePortal(QObject):
    ready_changed = Signal(bool)
    authorization_failed = Signal(str)

    def __init__(self, *, ready: bool) -> None:
        super().__init__()
        self.ready = ready
        self.state = "ready" if ready else "idle"
        self.authorizations = 0
        self.selections: list[tuple[bytes, str]] = []
        self.shortcuts = 0
        self.restores = 0

    def authorize(self) -> None:
        self.authorizations += 1

    def set_clipboard_data(self, data: bytes, mime_type: str) -> bool:
        self.selections.append((data, mime_type))
        return self.ready

    def restore_clipboard(self) -> None:
        self.restores += 1

    def send_paste_shortcut(self) -> bool:
        self.shortcuts += 1
        return self.ready


def test_wayland_panel_requests_permission_when_first_opened(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    portal = FakePortal(ready=False)
    panel = PopupPanel(Settings(), input_controller=portal)
    monkeypatch.setattr(
        panel.inserter,
        "capture_focused_field",
        lambda: (_ for _ in ()).throw(AssertionError("Wayland must not invoke xdotool")),
    )

    panel.show_panel()

    assert portal.authorizations == 1
    assert "Approve keyboard and clipboard access" in panel.hint.text()
    panel.close()


def test_wayland_text_uses_portal_clipboard_and_restores_it(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    portal = FakePortal(ready=True)
    panel = PopupPanel(Settings(), input_controller=portal)
    monkeypatch.setattr(panel.inserter, "insert", lambda _value: False)
    callbacks = []
    monkeypatch.setattr(QTimer, "singleShot", lambda _delay, callback: callbacks.append(callback))
    panel.show()

    assert panel._insert_text("🚀")
    assert portal.selections == [("🚀".encode(), "text/plain;charset=utf-8")]
    assert not panel.isVisible()
    assert panel._paste_snapshot is not None
    assert panel._paste_snapshot.isVisible()
    assert panel._paste_snapshot.windowFlags() & Qt.WindowType.WindowDoesNotAcceptFocus
    assert panel._paste_snapshot.windowFlags() & Qt.WindowType.WindowTransparentForInput
    assert panel._paste_snapshot.windowFlags() & Qt.WindowType.X11BypassWindowManagerHint

    while portal.shortcuts == 0:
        callbacks.pop(0)()
    assert portal.shortcuts == 1
    callbacks.pop(0)()

    assert portal.restores == 1
    assert panel.isVisible()
    assert panel._paste_snapshot is None
    panel.close()


def test_wayland_clipboard_activation_keeps_panel_closed(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    QApplication.instance() or QApplication([])
    portal = FakePortal(ready=True)
    panel = PopupPanel(Settings(), input_controller=portal)
    callbacks = []
    monkeypatch.setattr(QTimer, "singleShot", lambda _delay, callback: callbacks.append(callback))
    panel.show()

    assert panel._insert_with_portal_clipboard(
        b"clipboard text", "text/plain;charset=utf-8", keep_open=False
    )
    assert panel._paste_snapshot is None
    callbacks.pop(0)()
    callbacks.pop(0)()

    assert portal.shortcuts == 1
    assert portal.restores == 1
    assert not panel.isVisible()
    panel.close()
