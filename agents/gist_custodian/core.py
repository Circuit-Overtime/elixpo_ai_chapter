"""Deterministic maintenance for bounded shared Gist files."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from lib.github.gists import (
    DISCUSSIONS_FILENAME,
    FOLLOWUP_FILENAME,
    MERGE_SUMMARIES_FILENAME,
    MODEL_CACHE_FILENAME,
    RevisionedGist,
    parse_json_file,
    render_json,
)
from lib.state.discussions import DiscussionMemory
from lib.state.followups import FOLLOWUP_COMPLETION_LIMIT, FollowupMemory
from lib.state.gist_memory import MergeSummaryMemory, ModelCacheMemory

FILES = (FOLLOWUP_FILENAME, MERGE_SUMMARIES_FILENAME, MODEL_CACHE_FILENAME, DISCUSSIONS_FILENAME)


def _digest(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def _validated(filename: str, payload: object):
    if isinstance(payload, dict) and int(payload.get("schema_version", 1)) > 1:
        raise ValueError(f"Gist file {filename!r} uses an unsupported future schema")
    if filename == FOLLOWUP_FILENAME:
        return FollowupMemory.model_validate(payload)
    if filename == MERGE_SUMMARIES_FILENAME:
        return MergeSummaryMemory.model_validate(payload)
    if filename == MODEL_CACHE_FILENAME:
        return ModelCacheMemory.model_validate(payload)
    if filename == DISCUSSIONS_FILENAME:
        return DiscussionMemory.model_validate(payload)
    raise ValueError(f"unsupported managed Gist file: {filename}")


def _empty(filename: str):
    if filename == FOLLOWUP_FILENAME:
        return FollowupMemory()
    if filename == MERGE_SUMMARIES_FILENAME:
        return MergeSummaryMemory()
    if filename == MODEL_CACHE_FILENAME:
        return ModelCacheMemory()
    if filename == DISCUSSIONS_FILENAME:
        return DiscussionMemory()
    raise ValueError(f"unsupported managed Gist file: {filename}")


def _maintain(document, *, now: datetime) -> dict:
    result = {"pruned": 0, "compacted": 0}
    if isinstance(document, FollowupMemory):
        result["pruned"] = len(document.prune_expired(now=now))
        before = len(document.completed)
        document.completed = document.completed[-FOLLOWUP_COMPLETION_LIMIT:]
        result["compacted"] = before - len(document.completed)
    elif isinstance(document, MergeSummaryMemory):
        result["compacted"] = document.compact()
    elif isinstance(document, ModelCacheMemory):
        result["pruned"] = document.prune(now=now)
    elif isinstance(document, DiscussionMemory):
        result["compacted"] = document.compact()
    document.schema_version = 1
    document.updated_at = now.isoformat()
    return result


async def maintain_gist(
    gist: RevisionedGist,
    *,
    dry_run: bool = False,
    repair: bool = False,
    confirm_reset: bool = False,
    now: datetime | None = None,
) -> dict:
    """Validate, migrate, prune, and compact all managed files in one checked write."""
    current = now or datetime.now(timezone.utc)
    snapshot = await gist.snapshot()
    replacements: dict[str, str] = {}
    files: list[dict] = []
    corrupted = False

    for filename in FILES:
        raw = snapshot.files.get(filename, "")
        try:
            payload = parse_json_file(snapshot, filename, {})
            document = _validated(filename, payload)
            metrics = _maintain(document, now=current)
            rendered = render_json(document.model_dump(mode="json"))
            replacements[filename] = rendered
            files.append(
                {"filename": filename, "status": "updated" if rendered != raw else "clean", **metrics}
            )
        except Exception as exc:
            corrupted = True
            files.append(
                {
                    "filename": filename,
                    "status": "corrupted",
                    "content_sha256": _digest(raw),
                    "error": str(exc)[:300],
                }
            )
            if repair and confirm_reset:
                document = _empty(filename)
                _maintain(document, now=current)
                replacements[filename] = render_json(document.model_dump(mode="json"))
                files[-1]["status"] = "reset"

    if corrupted and not (repair and confirm_reset):
        return {
            "schema_version": 1,
            "status": "repair_required",
            "dry_run": dry_run,
            "updated_at": current.isoformat(),
            "revision": snapshot.revision,
            "files": files,
        }
    changed_files = {
        name: content for name, content in replacements.items() if snapshot.files.get(name, "") != content
    }
    if changed_files and not dry_run:
        updated = await gist.save_files(changed_files, expected=snapshot)
        revision = updated.revision
    else:
        revision = snapshot.revision
    return {
        "schema_version": 1,
        "status": "preview" if dry_run else "complete",
        "dry_run": dry_run,
        "updated_at": current.isoformat(),
        "revision": revision,
        "changed_files": sorted(changed_files),
        "files": files,
    }
