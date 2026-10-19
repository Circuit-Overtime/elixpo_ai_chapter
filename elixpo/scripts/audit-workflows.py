#!/usr/bin/env python3
"""Audit ordinary workflows in canonical Elixpo repositories.

The active Elixpoo and Crumb runtimes are assessed through their dedicated
authorization and product audits. OreoPI remains deferred. Generated subtree
copies are never treated as source repositories.
"""

from __future__ import annotations

import argparse
import configparser
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import urlparse


SPECIALIZED_AGENT_REPOSITORIES = {"agent.elixpo", "crumb.elixpo"}
DEFERRED_REPOSITORIES = {"oreoPI"}
LOCAL_DIRECTORY_ALIASES = {"mails.elixpo": "mail.elixpo"}
AGENT_WORKFLOWS = {
    "artifact-update.yml",
    "elixpo-agent.yml",
    "elixpo-ci.yml",
    "elixpo-triage.yml",
    "elixpoo-ack.yml",
    "elixpoo-mentions.yml",
    "elixpoo-merge-memory.yml",
    "elixpoo-review.yml",
    "elixpoo-retry.yml",
    "elixpoo-triage.yml",
    "issue-auto-fix.yml",
    "issue-triage.yml",
    "on-merge.yml",
    "pr-assign.yml",
    "pr-description-fill.yml",
    "pr-review-request.yml",
    "pr-triage.yml",
}
ACTION_RE = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)", re.MULTILINE)
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REVIEWED_FORK_SECRET_BOUNDARIES = {
    ("accounts.elixpo", "deploy.yml"): (
        "The pull-request job is secretless; every secret-consuming job is "
        "restricted to a main-branch push or an explicit workflow dispatch."
    ),
    ("blogs.elixpo", "pr-build.yml"): (
        "The build job is secretless; the preview job requires a same-repository, "
        "non-draft pull request before Cloudflare credentials are referenced."
    ),
}


@dataclass
class Finding:
    repository: str
    workflow: str
    severity: str
    rule: str
    detail: str


def repository_name(url: str) -> str | None:
    path = urlparse(url).path.strip("/")
    return path.split("/")[-1] if path else None


def local_repositories(workspace: Path) -> dict[str, Path]:
    """Index checkouts by normalized GitHub origin, including renamed folders."""
    repositories: dict[str, Path] = {}
    for candidate in workspace.iterdir():
        config_path = candidate / ".git" / "config"
        if not candidate.is_dir() or not config_path.is_file():
            continue
        config = configparser.ConfigParser()
        try:
            config.read(config_path, encoding="utf-8")
            remote = config.get('remote "origin"', "url", fallback="")
        except configparser.Error:
            continue
        normalized = remote.removesuffix(".git").replace("git@github.com:", "https://github.com/")
        if normalized:
            repositories[normalized.lower()] = candidate
    return repositories


def workflow_findings(repository: str, path: Path) -> list[Finding]:
    text = path.read_text(encoding="utf-8")
    findings: list[Finding] = []
    label = path.name

    if not re.search(r"(?m)^permissions:\s*(?:\{\}|read-all|write-all)?\s*$", text):
        findings.append(Finding(repository, label, "error", "permissions", "No top-level permissions boundary."))
    elif re.search(r"(?m)^permissions:\s*write-all\s*$", text):
        findings.append(Finding(repository, label, "error", "permissions", "Top-level permissions uses write-all."))

    if "pull_request_target:" in text:
        findings.append(Finding(repository, label, "error", "untrusted-trigger", "Uses pull_request_target."))

    workflow_call_only = "workflow_call:" in text and not any(
        marker in text for marker in ("pull_request:", "push:", "schedule:", "workflow_dispatch:")
    )
    if not workflow_call_only and not re.search(r"(?m)^concurrency:\s*", text):
        findings.append(Finding(repository, label, "warning", "concurrency", "No workflow concurrency policy."))

    if not re.search(r"(?m)^\s{4}timeout-minutes:\s*\d+\s*$", text):
        findings.append(Finding(repository, label, "warning", "timeout", "No job-level timeout-minutes found."))

    for action in ACTION_RE.findall(text):
        if action.startswith("./") or action.startswith("docker://"):
            continue
        if "@" not in action:
            findings.append(Finding(repository, label, "error", "action-pin", f"Action has no ref: {action}"))
            continue
        _, ref = action.rsplit("@", 1)
        if not FULL_SHA_RE.fullmatch(ref):
            findings.append(Finding(repository, label, "error", "action-pin", f"Action is not pinned to a full commit SHA: {action}"))

    if (
        "pull_request:" in text
        and re.search(r"secrets\.[A-Z0-9_]+", text)
        and (repository, label) not in REVIEWED_FORK_SECRET_BOUNDARIES
    ):
        findings.append(Finding(repository, label, "warning", "fork-secrets", "Pull-request workflow references secrets; verify that secret-consuming jobs reject fork code."))

    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=Path("content/repositories.json"))
    parser.add_argument("--workspace", type=Path, default=Path(".."))
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    findings: list[Finding] = []
    audited = 0
    audited_repositories: set[str] = set()
    missing: list[str] = []
    checkout_by_origin = local_repositories(args.workspace)

    for record in registry["entries"]:
        name = record["name"]
        if record["lifecycle"] == "archived" or name in DEFERRED_REPOSITORIES | SPECIALIZED_AGENT_REPOSITORIES:
            continue
        url = record.get("repositoryUrl") or ""
        if not url or "github.com/elixpo/" not in url:
            continue
        canonical_name = repository_name(url)
        if not canonical_name:
            continue
        repo = checkout_by_origin.get(
            url.removesuffix(".git").lower(),
            args.workspace / LOCAL_DIRECTORY_ALIASES.get(canonical_name, canonical_name),
        )
        if canonical_name == "elixpo":
            repo = Path.cwd()
        if not repo.is_dir():
            missing.append(name)
            continue
        workflows = repo / ".github" / "workflows"
        if not workflows.is_dir():
            continue
        audited_repositories.add(name)
        for path in sorted([*workflows.glob("*.yml"), *workflows.glob("*.yaml")]):
            if path.name in AGENT_WORKFLOWS:
                continue
            audited += 1
            findings.extend(workflow_findings(name, path))

    result = {
        "auditedWorkflows": audited,
        "auditedRepositories": sorted(audited_repositories),
        "deferredRepositories": sorted(DEFERRED_REPOSITORIES),
        "specializedAgentRepositories": sorted(SPECIALIZED_AGENT_REPOSITORIES),
        "excludedAgentWorkflows": sorted(AGENT_WORKFLOWS),
        "reviewedForkSecretBoundaries": [
            {
                "repository": repository,
                "workflow": workflow,
                "reason": reason,
            }
            for (repository, workflow), reason in sorted(REVIEWED_FORK_SECRET_BOUNDARIES.items())
        ],
        "missingLocalRepositories": sorted(missing),
        "counts": {
            "errors": sum(f.severity == "error" for f in findings),
            "warnings": sum(f.severity == "warning" for f in findings),
        },
        "findings": [asdict(f) for f in findings],
    }
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        "Workflow audit: "
        f"{audited} workflow(s), "
        f"{result['counts']['errors']} error(s), "
        f"{result['counts']['warnings']} warning(s)"
    )
    return 1 if result["counts"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
