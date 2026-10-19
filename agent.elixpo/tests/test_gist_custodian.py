"""Gist custodian tests use an in-memory revisioned Gist."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from agents.gist_custodian.core import maintain_gist
from lib.github.gists import (
    DISCUSSIONS_FILENAME,
    FOLLOWUP_FILENAME,
    MERGE_SUMMARIES_FILENAME,
    MODEL_CACHE_FILENAME,
    GistConflictError,
    GistSnapshot,
    RevisionedGist,
)
from lib.state.followups import FollowupMemory, FollowupRecord
from lib.state.gist_memory import ModelCacheEntry, ModelCacheMemory


class MemoryGist(RevisionedGist):
    def __init__(self, files=None):
        self.files = files or {}
        self.revision = "r1"
        self.saved = None

    async def snapshot(self):
        return GistSnapshot(files=dict(self.files), revision=self.revision, etag='"etag-1"')

    async def save_files(self, files, *, expected):
        if expected.revision != self.revision:
            raise GistConflictError("stale")
        self.files.update(files)
        self.saved = dict(files)
        self.revision = "r2"
        return await self.snapshot()


@pytest.mark.asyncio
async def test_custodian_creates_separate_files_and_prunes_expired_items():
    now = datetime(2026, 8, 9, tzinfo=timezone.utc)
    expired = FollowupRecord.create(
        repository="elixpo/repo",
        subject_number=1,
        subject_url="https://github.test/elixpo/repo/pull/1",
        ttl_days=60,
        now=now - timedelta(days=61),
    )
    followups = FollowupMemory(active={expired.key: expired})
    cache = ModelCacheMemory(
        entries={
            "old": ModelCacheEntry(
                namespace="safety",
                source_hash="abc",
                value="SAFE",
                created_at=(now - timedelta(days=2)).isoformat(),
                expires_at=(now - timedelta(days=1)).isoformat(),
            )
        }
    )
    gist = MemoryGist(
        {
            FOLLOWUP_FILENAME: json.dumps(followups.model_dump(mode="json")),
            MODEL_CACHE_FILENAME: json.dumps(cache.model_dump(mode="json")),
        }
    )

    receipt = await maintain_gist(gist, now=now)

    assert receipt["status"] == "complete"
    assert set(gist.saved) == {
        FOLLOWUP_FILENAME,
        MERGE_SUMMARIES_FILENAME,
        MODEL_CACHE_FILENAME,
        DISCUSSIONS_FILENAME,
    }
    assert json.loads(gist.files[FOLLOWUP_FILENAME])["active"] == {}
    assert json.loads(gist.files[MODEL_CACHE_FILENAME])["entries"] == {}


@pytest.mark.asyncio
async def test_custodian_dry_run_does_not_write():
    gist = MemoryGist()
    receipt = await maintain_gist(gist, dry_run=True)
    assert receipt["status"] == "preview"
    assert gist.saved is None
    assert len(receipt["changed_files"]) == 4


@pytest.mark.asyncio
async def test_corruption_fails_closed_until_explicit_reset():
    gist = MemoryGist({FOLLOWUP_FILENAME: "{not-json"})

    receipt = await maintain_gist(gist)
    assert receipt["status"] == "repair_required"
    assert gist.saved is None
    assert receipt["files"][0]["content_sha256"]
    assert "{not-json" not in json.dumps(receipt)

    repaired = await maintain_gist(gist, repair=True, confirm_reset=True)
    assert repaired["status"] == "complete"
    assert json.loads(gist.files[FOLLOWUP_FILENAME])["schema_version"] == 1


@pytest.mark.asyncio
async def test_revisioned_gist_rejects_concurrent_write():
    class API:
        calls = 0

        async def _request(self, method, path, **kwargs):
            self.calls += 1
            version = "r1" if self.calls == 1 else "r2"
            return {"history": [{"version": version}], "files": {}}

    gist = RevisionedGist(API(), "gist-id")
    snapshot = await gist.snapshot()
    with pytest.raises(GistConflictError):
        await gist.save_files({"file.json": "{}\n"}, expected=snapshot)


@pytest.mark.asyncio
async def test_future_schema_fails_closed_instead_of_downgrading():
    gist = MemoryGist({FOLLOWUP_FILENAME: json.dumps({"schema_version": 99})})
    receipt = await maintain_gist(gist)
    assert receipt["status"] == "repair_required"
    assert "future schema" in receipt["files"][0]["error"]
