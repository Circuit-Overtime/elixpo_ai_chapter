"""Revision-checked JSON-file abstractions over one private GitHub Gist."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from lib.state.followups import FollowupMemory

FOLLOWUP_FILENAME = "elixpoo-followups.json"
MERGE_SUMMARIES_FILENAME = "elixpoo-merge-summaries.json"
MODEL_CACHE_FILENAME = "elixpoo-model-cache.json"
DISCUSSIONS_FILENAME = "elixpoo-discussions.json"


class GistConflictError(RuntimeError):
    """The Gist changed after it was read, so writing would lose another run."""


@dataclass(frozen=True)
class GistSnapshot:
    files: dict[str, str]
    revision: str
    etag: str = ""


def _revision(gist: dict) -> str:
    history = gist.get("history") or []
    return str((history[0] if history else {}).get("version") or gist.get("updated_at") or "")


class RevisionedGist:
    """Read and conditionally replace selected files in a Gist."""

    def __init__(self, api, gist_id: str):
        if not gist_id.strip():
            raise ValueError("Gist ID is required")
        self.api = api
        self.gist_id = gist_id.strip()

    async def snapshot(self) -> GistSnapshot:
        if hasattr(self.api, "request_json_with_headers"):
            gist, headers = await self.api.request_json_with_headers("GET", f"/gists/{self.gist_id}")
        else:
            gist = await self.api._request("GET", f"/gists/{self.gist_id}")
            headers = {}
        files: dict[str, str] = {}
        for name, file in (gist.get("files") or {}).items():
            if file.get("truncated"):
                raise RuntimeError(f"Gist file {name!r} is unexpectedly truncated")
            files[name] = str(file.get("content") or "")
        return GistSnapshot(files=files, revision=_revision(gist), etag=str(headers.get("etag") or ""))

    async def save_files(self, files: dict[str, str], *, expected: GistSnapshot) -> GistSnapshot:
        current = await self.snapshot()
        if current.revision != expected.revision or (expected.etag and current.etag != expected.etag):
            raise GistConflictError("Gist changed after it was read; retry from a fresh snapshot")
        headers = {"If-Match": current.etag} if current.etag else {}
        payload = {name: {"content": content} for name, content in files.items()}
        if hasattr(self.api, "request_json_with_headers"):
            try:
                gist, response_headers = await self.api.request_json_with_headers(
                    "PATCH", f"/gists/{self.gist_id}", json={"files": payload}, headers=headers
                )
            except httpx.HTTPStatusError as exc:
                try:
                    detail = str(exc.response.json().get("message") or "request rejected")
                except (ValueError, AttributeError):
                    detail = "request rejected"
                raise RuntimeError(
                    f"GitHub rejected Gist memory update ({exc.response.status_code}): {detail}; "
                    "ELIXPOO_GIST_AGENTIC_TOKEN needs Gists user permission: write"
                ) from exc
            merged = dict(current.files)
            merged.update(files)
            return GistSnapshot(
                files=merged,
                revision=_revision(gist or {}),
                etag=str(response_headers.get("etag") or ""),
            )
        await self.api._request(
            "PATCH", f"/gists/{self.gist_id}", json={"files": payload}, headers=headers
        )
        merged = dict(current.files)
        merged.update(files)
        return GistSnapshot(files=merged, revision=current.revision, etag=current.etag)


def parse_json_file(snapshot: GistSnapshot, filename: str, default: Any) -> Any:
    content = snapshot.files.get(filename, "").strip()
    if not content:
        return default
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Gist file {filename!r} contains invalid JSON") from exc


def render_json(payload: Any) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


class FollowupGist:
    def __init__(self, api, gist_id: str, filename: str = FOLLOWUP_FILENAME):
        self.api = api
        self.store = RevisionedGist(api, gist_id)
        self.gist_id = self.store.gist_id
        self.filename = filename
        self._snapshot: GistSnapshot | None = None

    async def load(self) -> FollowupMemory:
        self._snapshot = await self.store.snapshot()
        payload = parse_json_file(self._snapshot, self.filename, {})
        return FollowupMemory.model_validate(payload)

    async def save(self, memory: FollowupMemory) -> None:
        if self._snapshot is None:
            raise RuntimeError("load follow-up memory before saving it")
        self._snapshot = await self.store.save_files(
            {self.filename: render_json(memory.model_dump(mode="json"))},
            expected=self._snapshot,
        )


class DiscussionGist:
    """Revision-checked durable cursors and handled IDs for Discussion polling."""

    def __init__(self, api, gist_id: str, filename: str = DISCUSSIONS_FILENAME):
        self.store = RevisionedGist(api, gist_id)
        self.filename = filename
        self._snapshot: GistSnapshot | None = None

    async def load(self):
        from lib.state.discussions import DiscussionMemory

        self._snapshot = await self.store.snapshot()
        return DiscussionMemory.model_validate(parse_json_file(self._snapshot, self.filename, {}))

    async def save(self, memory) -> None:
        if self._snapshot is None:
            raise RuntimeError("load Discussion memory before saving it")
        self._snapshot = await self.store.save_files(
            {self.filename: render_json(memory.model_dump(mode="json"))}, expected=self._snapshot
        )
