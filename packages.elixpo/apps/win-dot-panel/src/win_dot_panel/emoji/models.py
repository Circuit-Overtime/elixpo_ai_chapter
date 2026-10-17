"""Bundled emoji record data."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmojiRecord:
    id: int
    emoji: str
    name: str
    category: str | None = None
    subcategory: str | None = None
    keywords: str | None = None
    sort_order: int = 0
