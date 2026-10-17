"""Indexed, paged access to local clipboard history."""

from __future__ import annotations

import sqlite3

from win_dot_panel.clipboard.models import ClipboardItem, ClipboardPreview


def _item(row: sqlite3.Row) -> ClipboardItem:
    return ClipboardItem(
        id=row["id"],
        text_content=row["text_content"],
        content_hash=row["content_hash"],
        created_at=row["created_at"],
        last_used_at=row["last_used_at"],
        use_count=row["use_count"],
        is_pinned=bool(row["is_pinned"]),
        content_type=row["content_type"],
        image_content=row["image_content"],
    )


class ClipboardRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def record_text(
        self, text: str, content_hash: str, *, timestamp: int, history_limit: int
    ) -> ClipboardItem:
        if not text:
            raise ValueError("Clipboard text cannot be empty")
        if history_limit < 1:
            raise ValueError("history_limit must be positive")
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO clipboard_items
                    (text_content, content_hash, created_at, last_used_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(content_hash) DO UPDATE SET
                    last_used_at = excluded.last_used_at,
                    use_count = clipboard_items.use_count + 1
                """,
                (text, content_hash, timestamp, timestamp),
            )
            self._trim(history_limit)
        row = self.connection.execute(
            "SELECT * FROM clipboard_items WHERE content_hash = ?", (content_hash,)
        ).fetchone()
        if row is None:
            raise RuntimeError("New clipboard item was removed by retention")
        return _item(row)

    def record_image(
        self,
        image: bytes,
        thumbnail: bytes,
        content_hash: str,
        *,
        timestamp: int,
        history_limit: int,
    ) -> ClipboardItem:
        if not image or not thumbnail:
            raise ValueError("Clipboard image cannot be empty")
        if history_limit < 1:
            raise ValueError("history_limit must be positive")
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO clipboard_items
                    (content_type, text_content, image_content, thumbnail_content,
                     content_hash, created_at, last_used_at)
                VALUES ('image', '', ?, ?, ?, ?, ?)
                ON CONFLICT(content_hash) DO UPDATE SET
                    last_used_at = excluded.last_used_at,
                    use_count = clipboard_items.use_count + 1
                """,
                (image, thumbnail, content_hash, timestamp, timestamp),
            )
            self._trim(history_limit)
        row = self.connection.execute(
            "SELECT * FROM clipboard_items WHERE content_hash = ?", (content_hash,)
        ).fetchone()
        if row is None:
            raise RuntimeError("New clipboard item was removed by retention")
        return _item(row)

    def _trim(self, history_limit: int) -> None:
        self.connection.execute(
            """
            DELETE FROM clipboard_items
            WHERE is_pinned = 0 AND id NOT IN (
                SELECT id FROM clipboard_items
                WHERE is_pinned = 0
                ORDER BY last_used_at DESC, id DESC
                LIMIT ?
            )
            """,
            (history_limit,),
        )

    def get(self, item_id: int) -> ClipboardItem | None:
        row = self.connection.execute(
            "SELECT * FROM clipboard_items WHERE id = ?", (item_id,)
        ).fetchone()
        return _item(row) if row is not None else None

    def list_recent(self, *, limit: int = 30, offset: int = 0) -> list[ClipboardItem]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination")
        rows = self.connection.execute(
            """
            SELECT * FROM clipboard_items
            ORDER BY is_pinned DESC, last_used_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        return [_item(row) for row in rows]

    def list_previews(
        self, *, query: str = "", limit: int = 30, offset: int = 0
    ) -> list[ClipboardPreview]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination")
        rows = self.connection.execute(
            """
            SELECT id, substr(text_content, 1, 240) AS preview,
                   length(text_content) AS char_count, use_count, is_pinned,
                   content_type, thumbnail_content
            FROM clipboard_items
            WHERE ? = '' OR instr(lower(text_content), lower(?)) > 0
                OR (content_type = 'image' AND instr('screenshot image', lower(?)) > 0)
            ORDER BY is_pinned DESC, last_used_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (query, query, query, limit, offset),
        )
        return [
            ClipboardPreview(
                id=row["id"],
                preview=row["preview"],
                char_count=row["char_count"],
                use_count=row["use_count"],
                is_pinned=bool(row["is_pinned"]),
                content_type=row["content_type"],
                thumbnail_content=row["thumbnail_content"],
            )
            for row in rows
        ]

    def set_pinned(self, item_id: int, pinned: bool) -> bool:
        with self.connection:
            result = self.connection.execute(
                "UPDATE clipboard_items SET is_pinned = ? WHERE id = ?",
                (int(pinned), item_id),
            )
        return result.rowcount > 0

    def delete(self, item_id: int) -> bool:
        with self.connection:
            result = self.connection.execute("DELETE FROM clipboard_items WHERE id = ?", (item_id,))
        return result.rowcount > 0

    def clear(self, *, include_pinned: bool = False) -> int:
        query = (
            "DELETE FROM clipboard_items"
            if include_pinned
            else "DELETE FROM clipboard_items WHERE is_pinned = 0"
        )
        with self.connection:
            result = self.connection.execute(query)
        return result.rowcount
