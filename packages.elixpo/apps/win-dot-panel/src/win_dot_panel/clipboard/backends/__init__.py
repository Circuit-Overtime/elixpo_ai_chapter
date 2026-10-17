"""Desktop and display server specific clipboard adapters."""

from __future__ import annotations

from typing import Protocol


class ClipboardBackend(Protocol):
    def start(self) -> bool: ...

    def stop(self) -> None: ...

    def get_text(self) -> str: ...

    def set_text(self, text: str) -> None: ...
