"""Plan and publish idempotent Elixpoo v2 caller pull requests."""

from __future__ import annotations

import asyncio
import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from agents.rollout_audit.core import CALLERS


@dataclass(frozen=True)
class CallerChange:
    path: str
    content: bytes
    status: str


@dataclass(frozen=True)
class RolloutPlan:
    repository: str
    changes: tuple[CallerChange, ...]
    error: str = ""
    excluded: bool = False

    @property
    def status(self) -> str:
        if self.excluded:
            return "excluded"
        if self.error:
            return "failed"
        return "drifted" if self.changes else "current"


def selected_repositories(manifest: dict[str, Any], only_repo: str = "") -> list[str]:
    owner = str(manifest["owner"])
    runtime_name = str(manifest["runtime_repository"]).split("/", 1)[-1]
    selected: list[str] = []
    for name, config in (manifest.get("repositories") or {}).items():
        config = config or {}
        if name == runtime_name or config.get("deferred"):
            continue
        if only_repo and only_repo not in {name, f"{owner}/{name}"}:
            continue
        if any(config.get(capability) for capability in CALLERS):
            selected.append(str(name))
    return sorted(selected, key=str.casefold)


def desired_callers(root: Path, config: dict[str, Any]) -> dict[str, bytes]:
    desired: dict[str, bytes] = {}
    for capability, filename in CALLERS.items():
        if config.get(capability):
            desired[f".github/workflows/{filename}"] = (root / "distribution" / "workflows" / filename).read_bytes()
    return desired


def rollout_digest(desired: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for path, content in sorted(desired.items()):
        digest.update(path.encode())
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return digest.hexdigest()


def _decode(payload: dict | list | None) -> bytes | None:
    if not isinstance(payload, dict) or payload.get("type") != "file":
        return None
    return base64.b64decode(str(payload.get("content") or "").replace("\n", ""))


async def plan_repository(api, owner: str, repo: str, desired: dict[str, bytes]) -> list[CallerChange]:
    changes: list[CallerChange] = []
    for path, wanted in desired.items():
        try:
            current = _decode(await api.get_repo_contents(owner, repo, path))
        except Exception as exc:
            if getattr(getattr(exc, "response", None), "status_code", None) != 404:
                raise
            current = None
        if current != wanted:
            changes.append(CallerChange(path, wanted, "add" if current is None else "update"))
    return changes


async def scan(
    api,
    root: Path,
    manifest: dict[str, Any],
    repositories: list[str],
    *,
    concurrency: int = 5,
    on_progress: Callable[[int, int, RolloutPlan], None] | None = None,
) -> list[RolloutPlan]:
    if concurrency < 1:
        raise ValueError("rollout concurrency must be at least one")
    owner = str(manifest["owner"])
    semaphore = asyncio.Semaphore(concurrency)

    async def one(repo: str) -> RolloutPlan:
        async with semaphore:
            try:
                metadata = await api.get_repo(owner, repo)
                config = (manifest.get("repositories") or {}).get(repo) or {}
                if (metadata.get("archived") or metadata.get("private")) and not config.get("opt_in_restricted"):
                    return RolloutPlan(repo, (), "repository is archived or private", excluded=True)
                desired = desired_callers(root, config)
                return RolloutPlan(repo, tuple(await plan_repository(api, owner, repo, desired)))
            except Exception as exc:
                return RolloutPlan(repo, (), f"{type(exc).__name__}: {exc}")

    tasks = [asyncio.create_task(one(repo)) for repo in repositories]
    completed: list[RolloutPlan] = []
    for future in asyncio.as_completed(tasks):
        plan = await future
        completed.append(plan)
        if on_progress:
            on_progress(len(completed), len(tasks), plan)
    return sorted(completed, key=lambda item: item.repository.casefold())


async def publish(api, root: Path, manifest: dict[str, Any], plan: RolloutPlan) -> dict[str, Any]:
    owner = str(manifest["owner"])
    repo = plan.repository
    config = (manifest.get("repositories") or {}).get(repo) or {}
    desired = desired_callers(root, config)
    digest = rollout_digest(desired)
    branch = f"chore/elixpoo-v2-{digest[:10]}"
    if not plan.changes:
        return {"repository": f"{owner}/{repo}", "status": "current"}

    open_pulls = await api.list_pulls(owner, repo, state="open", per_page=100)
    existing = next((pull for pull in open_pulls if str((pull.get("head") or {}).get("ref") or "") == branch), None)
    if existing:
        return {"repository": f"{owner}/{repo}", "status": "already_open", "pr_url": existing.get("html_url", "")}

    default_branch = await api.get_default_branch(owner, repo)
    base_ref = await api.get_ref(owner, repo, f"heads/{default_branch}")
    base_sha = str((base_ref.get("object") or {}).get("sha") or "")
    base_commit = await api.get_commit(owner, repo, base_sha)
    base_tree = str((base_commit.get("tree") or {}).get("sha") or "")
    entries = []
    for change in plan.changes:
        blob = await api.create_blob(owner, repo, change.content)
        entries.append({"path": change.path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree = await api.create_tree(owner, repo, base_tree, entries)
    commit = await api.create_commit(owner, repo, "chore: install Elixpoo v2 callers", str(tree["sha"]), [base_sha])
    await api.create_ref(owner, repo, f"refs/heads/{branch}", str(commit["sha"]))
    body = (
        "Installs the thin event callers for the centralized `elixpo/agent.elixpo@v2` project-management runtime. "
        "No agent implementation or product-code automation is copied into this repository.\n\n"
        "Capabilities enabled by this PR:\n"
        + "\n".join(f"- `{name}`" for name in CALLERS if config.get(name))
        + "\n\nRequired organization secrets and Project variables are documented in "
        "[`distribution/README.md`](https://github.com/elixpo/agent.elixpo/blob/v2/distribution/README.md).\n\n"
        f"Caller bundle: `{digest[:12]}`. Review repository-specific permissions before merging.\n\n"
        "<sub>@elixpoo</sub>"
    )
    pull = await api.create_pull(
        owner,
        repo,
        "[CHORE] Install Elixpoo v2 project workflows",
        body,
        branch,
        default_branch,
    )
    return {
        "repository": f"{owner}/{repo}",
        "status": "opened",
        "pr_url": pull.get("html_url", ""),
        "files": len(plan.changes),
    }
