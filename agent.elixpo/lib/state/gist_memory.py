"""Bounded schemas for non-authoritative shared Gist memory."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

MERGE_SUMMARY_LIMIT = 200
MODEL_CACHE_LIMIT = 500


def _time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class MergeSummary(BaseModel):
    key: str
    repository: str
    pull_number: int
    pull_url: str
    title: str = Field(default="", max_length=300)
    summary: str = Field(default="", max_length=4000)
    merged_at: str


class MergeSummaryMemory(BaseModel):
    schema_version: int = 1
    summaries: list[MergeSummary] = Field(default_factory=list)
    updated_at: str = ""

    def compact(self) -> int:
        before = len(self.summaries)
        by_key = {item.key: item for item in self.summaries}
        self.summaries = sorted(by_key.values(), key=lambda item: item.merged_at)[-MERGE_SUMMARY_LIMIT:]
        return before - len(self.summaries)


class ModelCacheEntry(BaseModel):
    namespace: str
    source_hash: str
    value: str = Field(max_length=16_000)
    created_at: str
    expires_at: str


class ModelCacheMemory(BaseModel):
    schema_version: int = 1
    entries: dict[str, ModelCacheEntry] = Field(default_factory=dict)
    updated_at: str = ""

    def prune(self, *, now: datetime | None = None) -> int:
        current = now or datetime.now(timezone.utc)
        before = len(self.entries)
        self.entries = {
            key: entry for key, entry in self.entries.items() if _time(entry.expires_at) > current
        }
        if len(self.entries) > MODEL_CACHE_LIMIT:
            ordered = sorted(self.entries.items(), key=lambda pair: pair[1].created_at)
            self.entries = dict(ordered[-MODEL_CACHE_LIMIT:])
        return before - len(self.entries)
