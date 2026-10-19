"""Bundled emoji records and persistent recent usage."""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterable

from win_dot_panel.emoji.models import EmojiRecord


def _emoji(row: sqlite3.Row) -> EmojiRecord:
    return EmojiRecord(
        id=row["id"],
        emoji=row["emoji"],
        name=row["name"],
        category=row["category"],
        subcategory=row["subcategory"],
        keywords=row["keywords"],
        sort_order=row["sort_order"],
    )


class EmojiRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def insert_many(self, records: Iterable[EmojiRecord]) -> None:
        with self.connection:
            self.connection.executemany(
                """
                INSERT INTO emoji (id, emoji, name, category, subcategory, keywords, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    emoji = excluded.emoji,
                    name = excluded.name,
                    category = excluded.category,
                    subcategory = excluded.subcategory,
                    keywords = excluded.keywords,
                    sort_order = excluded.sort_order
                """,
                (
                    (
                        record.id,
                        record.emoji,
                        record.name,
                        record.category,
                        record.subcategory,
                        record.keywords,
                        record.sort_order,
                    )
                    for record in records
                ),
            )

    def get(self, emoji_id: int) -> EmojiRecord | None:
        row = self.connection.execute("SELECT * FROM emoji WHERE id = ?", (emoji_id,)).fetchone()
        return _emoji(row) if row is not None else None

    def record_usage(self, emoji_id: int, *, timestamp: int) -> None:
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO emoji_usage (emoji_id, use_count, last_used_at)
                VALUES (?, 1, ?)
                ON CONFLICT(emoji_id) DO UPDATE SET
                    use_count = emoji_usage.use_count + 1,
                    last_used_at = excluded.last_used_at
                """,
                (emoji_id, timestamp),
            )

    def list_recent(self, *, limit: int = 30) -> list[EmojiRecord]:
        if limit < 1:
            raise ValueError("limit must be positive")
        rows = self.connection.execute(
            """
            SELECT emoji.* FROM emoji
            JOIN emoji_usage ON emoji_usage.emoji_id = emoji.id
            ORDER BY emoji_usage.last_used_at DESC, emoji_usage.use_count DESC,
                     emoji_usage.emoji_id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [_emoji(row) for row in rows]

    def list_categories(self) -> list[str]:
        rows = self.connection.execute(
            """
            SELECT category FROM emoji
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY MIN(sort_order)
            """
        )
        return [row[0] for row in rows]

    def list_category(
        self, category: str, *, limit: int = 100, offset: int = 0
    ) -> list[EmojiRecord]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination")
        rows = self.connection.execute(
            """
            SELECT * FROM emoji WHERE category = ?
            ORDER BY sort_order LIMIT ? OFFSET ?
            """,
            (category, limit, offset),
        )
        return [_emoji(row) for row in rows]

    def list_all(self, *, limit: int = 100, offset: int = 0) -> list[EmojiRecord]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination")
        rows = self.connection.execute(
            "SELECT * FROM emoji ORDER BY sort_order LIMIT ? OFFSET ?", (limit, offset)
        )
        return [_emoji(row) for row in rows]

    def search(
        self, query: str, *, category: str | None = None, limit: int = 100
    ) -> list[EmojiRecord]:
        if limit < 1:
            raise ValueError("limit must be positive")
        query = query.strip()
        if not query:
            return []
        exact = self.connection.execute("SELECT * FROM emoji WHERE emoji = ?", (query,)).fetchone()
        if exact is not None and (category is None or exact["category"] == category):
            return [_emoji(exact)]

        terms = re.findall(r"\w+", query.casefold())
        if not terms:
            return []
        expression = " AND ".join(f'"{term}"*' for term in terms)
        rows = self.connection.execute(
            """
            SELECT emoji.* FROM emoji_search
            JOIN emoji ON emoji.id = emoji_search.rowid
            WHERE emoji_search MATCH ? AND (? IS NULL OR emoji.category = ?)
            ORDER BY bm25(emoji_search), emoji.sort_order
            LIMIT ?
            """,
            (expression, category, category, limit),
        )
        return [_emoji(row) for row in rows]
