"""Bounded durable cursors and idempotency state for Discussion polling."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

HANDLED_SOURCE_LIMIT = 2000
COMMENT_CURSOR_LIMIT = 100


class DiscussionMemory(BaseModel):
    schema_version: int = 1
    thread_cursor: str | None = None
    comment_cursors: dict[str, str] = Field(default_factory=dict)
    handled_source_ids: list[str] = Field(default_factory=list)
    updated_at: str = ""

    def handled(self, source_id: object) -> bool:
        return str(source_id) in self.handled_source_ids

    def remember(self, source_id: object) -> None:
        value = str(source_id)
        if not value or value in self.handled_source_ids:
            return
        self.handled_source_ids.append(value)
        self.handled_source_ids = self.handled_source_ids[-HANDLED_SOURCE_LIMIT:]
        self.touch()

    def set_thread_cursor(self, cursor: str | None) -> None:
        if cursor == self.thread_cursor:
            return
        self.thread_cursor = cursor
        self.touch()

    def set_comment_cursor(self, discussion_id: str, cursor: str | None) -> None:
        if cursor:
            if self.comment_cursors.get(discussion_id) == cursor:
                return
            self.comment_cursors[discussion_id] = cursor
            if len(self.comment_cursors) > COMMENT_CURSOR_LIMIT:
                oldest = next(iter(self.comment_cursors))
                self.comment_cursors.pop(oldest, None)
        else:
            if discussion_id not in self.comment_cursors:
                return
            self.comment_cursors.pop(discussion_id, None)
        self.touch()

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def compact(self) -> int:
        before = len(self.handled_source_ids) + len(self.comment_cursors)
        self.handled_source_ids = list(dict.fromkeys(self.handled_source_ids))[-HANDLED_SOURCE_LIMIT:]
        if len(self.comment_cursors) > COMMENT_CURSOR_LIMIT:
            self.comment_cursors = dict(list(self.comment_cursors.items())[-COMMENT_CURSOR_LIMIT:])
        return before - len(self.handled_source_ids) - len(self.comment_cursors)
