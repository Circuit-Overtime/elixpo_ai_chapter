from __future__ import annotations

from PySide6.QtCore import QBuffer, QIODevice
from PySide6.QtGui import QColor, QImage

from win_dot_panel.clipboard.capture import MAX_TEXT_BYTES, ClipboardCapture
from win_dot_panel.storage.database import open_database
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository


def test_capture_deduplicates_and_rejects_unsafe_text(tmp_path):
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    capture = ClipboardCapture(repository, history_limit=1)

    assert capture.capture("first\r\nline")
    assert capture.capture("first\nline")
    assert repository.list_recent()[0].use_count == 2
    assert repository.list_recent()[0].text_content == "first\nline"

    assert not capture.capture("secret", sensitive=True)
    assert not capture.capture("")
    assert not capture.capture("bad\x00text")
    assert not capture.capture("x" * (MAX_TEXT_BYTES + 1))
    assert len(repository.list_recent()) == 1

    assert capture.capture("second")
    assert [item.text_content for item in repository.list_recent()] == ["second"]
    connection.close()


def test_capture_image_round_trips_and_deduplicates(tmp_path):
    connection = open_database(tmp_path / "panel.db")
    repository = ClipboardRepository(connection)
    capture = ClipboardCapture(repository, history_limit=2)
    image = QImage(4, 4, QImage.Format.Format_ARGB32)
    image.fill(QColor("red"))
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    assert image.save(buffer, "PNG")
    png = bytes(buffer.data())

    assert capture.capture_image(png, "image/png")
    assert capture.capture_image(png, "image/png")
    item = repository.list_recent()[0]
    assert item.content_type == "image"
    assert item.use_count == 2
    assert not QImage.fromData(item.image_content, "PNG").isNull()
    preview = repository.list_previews(query="screenshot")[0]
    assert preview.content_type == "image"
    assert not QImage.fromData(preview.thumbnail_content, "PNG").isNull()
    assert not capture.capture_image(b"invalid", "image/png")
    assert not capture.capture_image(png, "image/png", sensitive=True)
    connection.close()
