from __future__ import annotations

from PySide6.QtCore import QProcess
from PySide6.QtGui import QColor, QImage
from PySide6.QtWidgets import QApplication

from win_dot_panel.clipboard.backends.wayland import WaylandClipboardBackend


def test_watcher_exit_enables_qt_clipboard_fallback(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    backend = WaylandClipboardBackend()
    changes = []
    images = []
    backend.clipboard_changed.connect(lambda text, sensitive: changes.append((text, sensitive)))
    backend.image_changed.connect(
        lambda data, mime, sensitive: images.append((data, mime, sensitive))
    )

    backend._finished(1, QProcess.ExitStatus.NormalExit)
    app.clipboard().setText("copied after watcher stopped")
    image = QImage(2, 2, QImage.Format.Format_ARGB32)
    image.fill(QColor("yellow"))
    app.clipboard().setImage(image)

    assert backend._using_fallback
    assert ("copied after watcher stopped", False) in changes
    assert len(images) == 1
    assert images[0][1:] == ("image/png", False)
    backend.stop()
