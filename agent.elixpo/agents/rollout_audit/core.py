"""Compare the rollout manifest with live repository workflows without mutation."""

from __future__ import annotations

import asyncio
import base64
from pathlib import Path
from typing import Any

import yaml

CALLERS = {
    "triage": "elixpoo-triage.yml",
    "mentions": "elixpoo-mentions.yml",
    "review": "elixpoo-review.yml",
    "merge_memory": "elixpoo-merge-memory.yml",
}
REUSABLES = {
    "triage": "elixpoo-triage-reusable.yml",
    "mentions": "elixpoo-mention-reusable.yml",
    "review": "elixpoo-review-reusable.yml",
    "merge_memory": "elixpoo-merge-memory-reusable.yml",
}
DISCUSSIONS_CALLER = "discussions.yml"


def load_manifest(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text()) or {}
    if data.get("schema_version") != 1 or not data.get("owner") or not data.get("runtime_ref"):
        raise ValueError("invalid Elixpoo rollout manifest")
    return data


def inspect_callers(
    config: dict[str, Any], files: dict[str, str], runtime_repo: str, runtime_ref: str
) -> dict[str, Any]:
    expected = {CALLERS[name] for name in CALLERS if config.get(name) and not config.get("deferred")}
    if config.get("discussions_host") and not config.get("deferred"):
        expected.add(DISCUSSIONS_CALLER)
    missing = sorted(expected - set(files))
    stale: list[str] = []
    for capability, filename in CALLERS.items():
        if filename not in expected or filename not in files:
            continue
        needle = f"uses: {runtime_repo}/.github/workflows/{REUSABLES[capability]}@{runtime_ref}"
        if needle not in files[filename] or "pull_request_target" in files[filename]:
            stale.append(filename)
    managed = set(CALLERS.values()) | {DISCUSSIONS_CALLER}
    unexpected = sorted(filename for filename in files if filename in managed - expected)
    if DISCUSSIONS_CALLER in expected and DISCUSSIONS_CALLER in files:
        if "python -m agents.discussions" not in files[DISCUSSIONS_CALLER]:
            stale.append(DISCUSSIONS_CALLER)
    status = "current"
    if config.get("deferred"):
        status = "deferred"
    elif missing:
        status = "missing"
    elif stale:
        status = "stale"
    elif unexpected:
        status = "unexpected"
    return {"status": status, "missing": missing, "stale": sorted(stale), "unexpected": unexpected}


async def _workflows(api, owner: str, repo: str) -> dict[str, str]:
    try:
        items = await api.get_repo_contents(owner, repo, ".github/workflows")
    except Exception as exc:
        if getattr(getattr(exc, "response", None), "status_code", None) == 404:
            return {}
        raise
    result: dict[str, str] = {}
    for item in items if isinstance(items, list) else []:
        name = str(item.get("name") or "")
        if name not in set(CALLERS.values()) | {DISCUSSIONS_CALLER}:
            continue
        blob = await api.get_repo_contents(owner, repo, f".github/workflows/{name}")
        encoded = str(blob.get("content") or "").replace("\n", "")
        result[name] = base64.b64decode(encoded).decode(errors="replace")
    return result


async def audit(api, manifest: dict[str, Any], *, only_repo: str = "", concurrency: int = 5) -> dict[str, Any]:
    owner = str(manifest["owner"])
    live = await api._request("GET", f"/orgs/{owner}/repos", params={"per_page": 100, "type": "all"})
    live_by_name = {str(repo["name"]): repo for repo in live}
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def inspect(name: str, config: dict[str, Any]) -> dict[str, Any]:
        repository = live_by_name.get(name)
        if not repository:
            return {"repository": f"{owner}/{name}", "status": "missing_repository"}
        if (repository.get("archived") or repository.get("private")) and not config.get("opt_in_restricted"):
            return {"repository": f"{owner}/{name}", "status": "excluded", "reason": "archived_or_private"}
        async with semaphore:
            files = await _workflows(api, owner, name)
        result = inspect_callers(
            config,
            files,
            str(manifest["runtime_repository"]),
            str(manifest["runtime_ref"]),
        )
        return {"repository": f"{owner}/{name}", **result}

    selected = [
        (name, config or {})
        for name, config in (manifest.get("repositories") or {}).items()
        if not only_repo or name == only_repo or f"{owner}/{name}" == only_repo
    ]
    results = await asyncio.gather(*(inspect(name, config) for name, config in selected))
    manifest_names = {name for name, _ in selected}
    unlisted = sorted(
        name
        for name, repo in live_by_name.items()
        if name not in manifest_names and not repo.get("archived") and not repo.get("private") and not only_repo
    )
    return {
        "schema_version": 1,
        "read_only": True,
        "results": sorted(results, key=lambda item: item["repository"].casefold()),
        "unlisted_active_public": unlisted,
    }
