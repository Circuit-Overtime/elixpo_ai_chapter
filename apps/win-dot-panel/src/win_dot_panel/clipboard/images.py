"""Decode bounded clipboard images and make small display previews."""

from __future__ import annotations

from PySide6.QtCore import QBuffer, QIODevice, Qt
from PySide6.QtGui import QImageReader

MAX_IMAGE_BYTES = 16 * 1024 * 1024
MAX_IMAGE_PIXELS = 16 * 1024 * 1024


def _png_bytes(image) -> bytes | None:
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    if not image.save(buffer, "PNG"):
        return None
    return bytes(buffer.data())


def normalize_image(data: bytes, mime_type: str) -> tuple[bytes, bytes] | None:
    if not mime_type.startswith("image/") or not data or len(data) > MAX_IMAGE_BYTES:
        return None
    source = QBuffer()
    source.setData(data)
    source.open(QIODevice.OpenModeFlag.ReadOnly)
    reader = QImageReader(source)
    dimensions = reader.size()
    if not dimensions.isValid() or dimensions.width() * dimensions.height() > MAX_IMAGE_PIXELS:
        return None
    image = reader.read()
    if image.isNull():
        return None
    png = _png_bytes(image)
    if png is None or len(png) > MAX_IMAGE_BYTES:
        return None
    thumbnail = _png_bytes(
        image.scaled(
            96,
            96,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )
    )
    if thumbnail is None:
        return None
    return png, thumbnail
