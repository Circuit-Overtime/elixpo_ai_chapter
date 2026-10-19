"""Revision-checked, bounded merged-change memory."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from lib.github.gists import MERGE_SUMMARIES_FILENAME, RevisionedGist, parse_json_file, render_json
from pydantic import BaseModel, ConfigDict, Field

MERGE_LIMIT = 300


def redact_memory_text(value: str) -> str:
    value = re.sub(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[redacted-email]", value or "")
    value = re.sub(r"(?i)(token|secret|password|authorization)\s*[:=]\s*\S+", r"\1=[redacted]", value)
    return value


class MergeRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = 1
    idempotency_key: str
    repository: str
    pull_number: int
    pull_url: str
    merge_commit_sha: str
    title: str = Field(max_length=300)
    author: str = Field(max_length=100)
    merger: str = Field(max_length=100)
    merged_at: str
    labels: tuple[str, ...] = ()
    changed_areas: tuple[str, ...] = ()
    summary: str = Field(max_length=600)
    breaking: bool = False
    migration: bool = False
    release: bool = False
    documentation: bool = False
    follow_up: bool = False

    def model_post_init(self, __context) -> None:
        object.__setattr__(self, "title", redact_memory_text(self.title))
        object.__setattr__(self, "summary", redact_memory_text(self.summary))


class MergeLedger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = 2
    records: list[MergeRecord] = Field(default_factory=list)
    updated_at: str = ""

    def add(self, record: MergeRecord) -> bool:
        if any(item.idempotency_key == record.idempotency_key for item in self.records):
            return False
        self.records.append(record)
        self.records = sorted(self.records, key=lambda item: item.merged_at)[-MERGE_LIMIT:]
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return True


async def remember_merge(gist: RevisionedGist, record: MergeRecord) -> bool:
    snapshot = await gist.snapshot()
    raw = parse_json_file(snapshot, MERGE_SUMMARIES_FILENAME, {})
    if raw and raw.get("schema_version") == 1:
        raw = {"schema_version": 2, "records": [], "updated_at": ""}
    ledger = MergeLedger.model_validate(raw or {})
    changed = ledger.add(record)
    if changed:
        await gist.save_files(
            {MERGE_SUMMARIES_FILENAME: render_json(ledger.model_dump(mode="json"))},
            expected=snapshot,
        )
    return changed
