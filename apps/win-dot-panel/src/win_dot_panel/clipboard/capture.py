"""Validate and store bounded clipboard changes."""

from __future__ import annotations

import hashlib
import time

from win_dot_panel.clipboard.images import normalize_image
from win_dot_panel.storage.repositories.clipboard_repository import ClipboardRepository

MAX_TEXT_BYTES = 1024 * 1024


def normalize_text(text: str) -> str | None:
    if not text or "\x00" in text:
        return None
    normalized = text.replace("\r\n", "\n")
    if len(normalized.encode("utf-8")) > MAX_TEXT_BYTES:
        return None
    return normalized


class ClipboardCapture:
    def __init__(self, repository: ClipboardRepository, *, history_limit: int) -> None:
        self.repository = repository
        self.history_limit = history_limit

    def capture(self, text: str, *, sensitive: bool = False) -> bool:
        if sensitive:
            return False
        normalized = normalize_text(text)
        if normalized is None:
            return False
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        self.repository.record_text(
            normalized, digest, timestamp=int(time.time_ns()), history_limit=self.history_limit
        )
        return True

    def capture_image(self, data: bytes, mime_type: str, *, sensitive: bool = False) -> bool:
        if sensitive:
            return False
        normalized = normalize_image(data, mime_type)
        if normalized is None:
            return False
        image, thumbnail = normalized
        digest = hashlib.sha256(b"image\0" + image).hexdigest()
        self.repository.record_image(
            image,
            thumbnail,
            digest,
            timestamp=int(time.time_ns()),
            history_limit=self.history_limit,
        )
        return True
