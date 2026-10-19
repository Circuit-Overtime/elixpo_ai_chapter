"""Central Elixpoo v2 runtime for triage, mentions, reviews, and merge memory."""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Any

import structlog
import yaml

from agents.elixpoo_v2.core import (
    MetadataAction,
    authorize_action,
    coding_refusal,
    contains_exact_mention,
    event_key,
    has_marker,
    is_coding_request,
    permission_tier,
    public_body,
    review_marker,
    route_comment,
    validate_allowlists,
)
from agents.elixpoo_v2.memory import MergeRecord, remember_merge
from agents.elixpoo_v2.model import classify, plan_response, review_pull, safety_check, summarize_merge
from agents.elixpoo_v2.project import ProjectRecords

log = structlog.get_logger()


def _event() -> dict[str, Any]:
    path = os.getenv("GITHUB_EVENT_PATH", "")
    return json.loads(Path(path).read_text()) if path else {}


def _repository(event: dict) -> str:
    value = str((event.get("repository") or {}).get("full_name") or os.getenv("GITHUB_REPOSITORY", ""))
    if value.count("/") != 1:
        raise ValueError("GitHub repository must be owner/name")
    return value


def _config(root: Path) -> dict:
    data = yaml.safe_load((root / "config/elixpoo_v2.yaml").read_text()) or {}
    if data.get("schema_version") != 2:
        raise ValueError("unsupported Elixpoo v2 configuration")
    return data


def _allowlists(config: dict) -> tuple[set[str], dict[str, set[str]]]:
    labels = {item for values in config["labels"].values() for item in values}
    fields = {name: set(values) for name, values in config["project_fields"].items()}
    return labels, fields


async def _ensure_and_apply_labels(
    api, owner: str, repo: str, number: int, subject: dict, wanted: set[str], config: dict
):
    specs = {
        name: ("d4c5f9", "Managed by the central Elixpoo v2 label taxonomy")
        for values in config["labels"].values()
        for name in values
    }
    for name in sorted(wanted):
        color, description = specs[name]
        await api.ensure_label(owner, repo, name, color, description)
    current = {str(item.get("name") or "") for item in subject.get("labels") or []}
    merged = sorted(current | wanted)
    if set(merged) != current:
        await api.update_issue(owner, repo, number, labels=merged)


async def triage_one(api, router, event: dict, config: dict, project=None) -> dict:
    repository = _repository(event)
    owner, repo = repository.split("/", 1)
    subject = event.get("pull_request") or event.get("issue") or {}
    number = int(subject["number"])
    kind = "pull-request" if event.get("pull_request") else "issue"
    allowed_labels, fields = _allowlists(config)
    result = await classify(
        router,
        {
            "repository": repository,
            "kind": kind,
            "title": subject.get("title"),
            "body": subject.get("body"),
            "existing_labels": [item.get("name") for item in subject.get("labels") or []],
        },
        sorted(allowed_labels),
        {name: sorted(values) for name, values in fields.items()},
    )
    action = MetadataAction(
        kind="labels",
        response=result.human_message or "This item has been classified.",
        add_labels=result.labels,
        project_fields=result.project_fields,
    )
    validate_allowlists(action, labels=allowed_labels, fields=fields)
    await _ensure_and_apply_labels(api, owner, repo, number, subject, set(action.add_labels), config)
    project_result = None
    if project is not None:
        project_result = await project.upsert(
            content_id=str(subject.get("node_id") or ""),
            repository=repository,
            values={"kind": kind, **result.project_fields},
        )
    commented = False
    if result.needs_human and result.human_message:
        comments = await api.get_issue_comments(owner, repo, number)
        key = event_key(repository, "triage", number, str(subject.get("updated_at") or ""))
        if not has_marker(comments, "triage", key):
            body = public_body(result.human_message, "triage", key)
            await safety_check(router, body)
            await api.create_issue_comment(owner, repo, number, body)
            commented = True
    return {
        "status": "complete",
        "repository": repository,
        "number": number,
        "labels": list(result.labels),
        "project_fields": result.project_fields,
        "project": project_result,
        "commented": commented,
    }


async def _permission(api, owner: str, repo: str, actor: str) -> str:
    try:
        result = await api._request("GET", f"/repos/{owner}/{repo}/collaborators/{actor}/permission")
        return str(result.get("permission") or "none")
    except Exception as exc:
        if getattr(getattr(exc, "response", None), "status_code", None) == 404:
            return "none"
        raise


async def _is_assignable(api, owner: str, repo: str, actor: str) -> bool:
    try:
        await api._request("GET", f"/repos/{owner}/{repo}/assignees/{actor}")
        return True
    except Exception as exc:
        if getattr(getattr(exc, "response", None), "status_code", None) == 404:
            return False
        raise


def _mention_subject(event: dict) -> tuple[str, dict, str, int]:
    if event.get("comment"):
        subject = event.get("issue") or event.get("pull_request") or {}
        scope = route_comment(subject) if event.get("issue") else "pull_request"
        return scope, subject, str(event["comment"].get("body") or ""), int(subject["number"])
    if event.get("review"):
        pull = event["pull_request"]
        return "pull_request", pull, str(event["review"].get("body") or ""), int(pull["number"])
    if event.get("pull_request"):
        pull = event["pull_request"]
        return "pull_request", pull, f"{pull.get('title', '')}\n\n{pull.get('body', '')}", int(pull["number"])
    issue = event["issue"]
    return "issue", issue, f"{issue.get('title', '')}\n\n{issue.get('body', '')}", int(issue["number"])


async def mention_one(api, router, event: dict, config: dict, project=None) -> dict:
    repository = _repository(event)
    owner, repo = repository.split("/", 1)
    scope, subject, request, number = _mention_subject(event)
    if not contains_exact_mention(request):
        return {"status": "ignored", "reason": "no exact @elixpoo mention"}
    comments = await api.get_issue_comments(owner, repo, number)
    delivery = str(
        os.getenv("GITHUB_DELIVERY", "")
        or (event.get("comment") or event.get("review") or subject).get("id")
        or subject.get("updated_at")
        or ""
    )
    key = event_key(repository, "mention", number, delivery)
    if has_marker(comments, "mention", key):
        return {"status": "duplicate", "key": key}
    actor = str((event.get("sender") or {}).get("login") or os.getenv("GITHUB_ACTOR", ""))
    author = str((subject.get("user") or {}).get("login") or "")
    if is_coding_request(request):
        action = coding_refusal()
    else:
        action = await plan_response(
            router,
            {
                "repository": repository,
                "scope": scope,
                "actor": actor,
                "author": author,
                "request": request,
                "subject": {"title": subject.get("title"), "body": subject.get("body"), "state": subject.get("state")},
                "recent_comments": [
                    {"author": (item.get("user") or {}).get("login"), "body": item.get("body")}
                    for item in comments[-12:]
                ],
            },
        )
    allowed_labels, fields = _allowlists(config)
    validate_allowlists(action, labels=allowed_labels, fields=fields)
    if action.kind == "review" and scope == "pull_request":
        pull = await api.get_pull(owner, repo, number)
        return await review_one(api, router, {**event, "repository": event.get("repository"), "pull_request": pull})
    permission = permission_tier(await _permission(api, owner, repo, actor))
    assignable = (
        {actor}
        if action.assignees and actor in action.assignees and await _is_assignable(api, owner, repo, actor)
        else set()
    )
    action = authorize_action(action, permission=permission, actor=actor, author=author, assignable=assignable)
    if action.kind == "project_field" and project is None:
        action = action.model_copy(update={"preview_only": True})
    if not action.preview_only:
        if action.kind == "rewrite_title":
            await api.update_issue(owner, repo, number, title=action.title)
        elif action.kind == "rewrite_body":
            await api.update_issue(owner, repo, number, body=action.body)
        elif action.kind == "labels":
            current = {str(item.get("name") or "") for item in subject.get("labels") or []}
            wanted = (current | set(action.add_labels)) - set(action.remove_labels)
            await _ensure_and_apply_labels(api, owner, repo, number, {**subject, "labels": []}, wanted, config)
        elif action.kind == "assignment":
            await api.update_issue(owner, repo, number, assignees=list(action.assignees))
        elif action.kind == "project_field":
            await project.upsert(
                content_id=str(subject.get("node_id") or ""),
                repository=repository,
                values=action.project_fields,
            )
    prefix = (
        "Preview only: "
        if action.preview_only and action.kind not in {"answer", "summarize", "review", "refuse"}
        else ""
    )
    body = public_body(prefix + action.response, "mention", key)
    await safety_check(router, body)
    posted = await api.create_issue_comment(owner, repo, number, body)
    return {
        "status": "complete",
        "action": action.kind,
        "preview_only": action.preview_only,
        "url": posted.get("html_url", ""),
    }


async def _repo_guidance(api, owner: str, repo: str, ref: str) -> dict[str, str]:
    guidance: dict[str, str] = {}
    for path in ("AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"):
        try:
            item = await api.get_repo_contents(owner, repo, path, ref=ref)
        except Exception as exc:
            if getattr(getattr(exc, "response", None), "status_code", None) == 404:
                continue
            raise
        if isinstance(item, dict) and item.get("content"):
            guidance[path] = base64.b64decode(str(item["content"]).replace("\n", "")).decode(errors="replace")[:6000]
    return guidance


async def review_one(api, router, event: dict) -> dict:
    repository = _repository(event)
    owner, repo = repository.split("/", 1)
    pull = event.get("pull_request") or {}
    number = int(pull["number"])
    head_sha = str((pull.get("head") or {}).get("sha") or "")
    reviews = await api.get_pull_reviews(owner, repo, number)
    if any(review_marker(head_sha) in str(item.get("body") or "") for item in reviews):
        return {"status": "duplicate", "head_sha": head_sha}
    files = await api.get_pull_files(owner, repo, number)
    diff = await api.get_pull_diff(owner, repo, number)
    commits = await api._request("GET", f"/repos/{owner}/{repo}/pulls/{number}/commits", params={"per_page": 100})
    base_ref = str((pull.get("base") or {}).get("ref") or "main")
    guidance = await _repo_guidance(api, owner, repo, base_ref)
    linked = [token for token in (pull.get("body") or "").split() if token.startswith("#") and token[1:].isdigit()]
    linked_issues = []
    for token in linked[:5]:
        try:
            issue = await api.get_issue(owner, repo, int(token[1:]))
        except Exception as exc:
            if getattr(getattr(exc, "response", None), "status_code", None) == 404:
                continue
            raise
        linked_issues.append(
            {
                "number": issue.get("number"),
                "title": issue.get("title"),
                "body": issue.get("body"),
                "labels": [label.get("name") for label in issue.get("labels") or []],
            }
        )
    result = await review_pull(
        router,
        {
            "repository": repository,
            "pull": {
                "title": pull.get("title"),
                "body": pull.get("body"),
                "author": (pull.get("user") or {}).get("login"),
                "head_sha": head_sha,
                "from_fork": ((pull.get("head") or {}).get("repo") or {}).get("fork", False),
            },
            "changed_files": [
                {"filename": item.get("filename"), "status": item.get("status"), "changes": item.get("changes")}
                for item in files
            ],
            "commits": [
                {"sha": item.get("sha"), "message": ((item.get("commit") or {}).get("message"))} for item in commits
            ],
            "linked_issues": linked_issues,
            "repository_instructions": guidance,
            "diff": diff[:50_000],
        },
    )
    changed_paths = {str(item.get("filename") or "") for item in files}
    result = result.model_copy(
        update={"findings": tuple(item for item in result.findings if item.path in changed_paths)}
    )
    lines = [result.summary]
    for heading, severity in (("Blocking findings", "blocking"), ("Suggestions", "suggestion")):
        findings = [item for item in result.findings if item.severity == severity]
        if findings:
            lines.extend(
                [f"\n**{heading}**"]
                + [
                    f"- `{item.path}:{item.line}` — **{item.title}**: {item.evidence} {item.recommendation}"
                    for item in findings
                ]
            )
    if not result.findings:
        lines.append("\nNo actionable findings were identified from the supplied diff and repository evidence.")
    body = "\n".join(lines) + f"\n\n{review_marker(head_sha)}"
    body = public_body(body, "review-disclosure", head_sha)
    await safety_check(router, body)
    posted = await api.create_pull_review(owner, repo, number, body, "COMMENT")
    return {
        "status": "complete",
        "head_sha": head_sha,
        "findings": len(result.findings),
        "url": posted.get("html_url", ""),
    }


async def merge_memory_one(api, gist_api, router, event: dict, gist_id: str) -> dict:
    from lib.github.gists import RevisionedGist

    pull = event.get("pull_request") or {}
    if not pull.get("merged"):
        return {"status": "ignored", "reason": "pull request was not merged"}
    repository = _repository(event)
    owner, repo = repository.split("/", 1)
    number = int(pull["number"])
    files = await api.get_pull_files(owner, repo, number)
    labels = tuple(sorted(str(item.get("name") or "") for item in pull.get("labels") or [] if item.get("name")))
    changed_areas = tuple(
        sorted({str(item.get("filename") or "").split("/", 1)[0] for item in files if item.get("filename")})
    )
    summary = await summarize_merge(
        router,
        {
            "title": pull.get("title"),
            "body": pull.get("body"),
            "labels": labels,
            "files": [item.get("filename") for item in files],
        },
    )
    text = f"{pull.get('title', '')}\n{pull.get('body', '')}\n{' '.join(labels)}".casefold()
    record = MergeRecord(
        idempotency_key=f"{repository}#{number}:{pull.get('merge_commit_sha')}",
        repository=repository,
        pull_number=number,
        pull_url=str(pull.get("html_url") or ""),
        merge_commit_sha=str(pull.get("merge_commit_sha") or ""),
        title=str(pull.get("title") or "")[:300],
        author=str((pull.get("user") or {}).get("login") or ""),
        merger=str((pull.get("merged_by") or {}).get("login") or ""),
        merged_at=str(pull.get("merged_at") or ""),
        labels=labels,
        changed_areas=changed_areas,
        summary=summary,
        breaking="breaking" in text,
        migration="migration" in text or "migrate" in text,
        release="release" in text,
        documentation=any(area in {"docs", "documentation"} for area in changed_areas),
        follow_up="follow-up" in text or "follow up" in text,
    )
    changed = await remember_merge(RevisionedGist(gist_api, gist_id), record)
    return {"status": "complete", "changed": changed, "idempotency_key": record.idempotency_key}


async def _run(mode: str) -> int:
    from lib.config import settings
    from lib.github.api import GitHubAPI
    from rtk import Budget, Router

    event = _event()
    config = _config(settings.root)
    token = settings.github.token
    if not token or not settings.pollinations.api_key:
        log.error("elixpoo_v2.missing_credentials", mode=mode)
        return 1
    api = GitHubAPI.from_token(token)
    project_api = None
    gist_api = None
    router = Router.from_settings(f"elixpoo-v2-{mode}", budget=Budget(mode, limit=20_000, kill_multiple=1.25))
    try:
        project = None
        if mode in {"triage", "mention"}:
            if settings.project.token and settings.project.owner and settings.project.number:
                project_api = GitHubAPI.from_token(settings.project.token)
                project = ProjectRecords(project_api, settings.project.owner, settings.project.number)
            elif mode == "triage":
                raise ValueError(
                    "triage requires ELIXPOO_GITHUB_PROJECT_TOKEN, ELIXPO_GITHUB_PROJECT_OWNER, "
                    "and ELIXPO_GITHUB_PROJECT_NUMBER"
                )
        if mode == "triage":
            result = await triage_one(api, router, event, config, project)
        elif mode == "mention":
            result = await mention_one(api, router, event, config, project)
        elif mode == "review":
            result = await review_one(api, router, event)
        else:
            if not settings.followups.gist_id:
                raise ValueError("ELIXPOO_FOLLOWUP_GIST_ID is required")
            if not settings.followups.gist_token:
                raise ValueError("ELIXPOO_GIST_AGENTIC_TOKEN is required")
            gist_api = GitHubAPI.from_token(settings.followups.gist_token)
            result = await merge_memory_one(api, gist_api, router, event, settings.followups.gist_id)
    except Exception as exc:
        log.error("elixpoo_v2.failed", mode=mode, error=str(exc), spent=router.budget.spent)
        return 1
    finally:
        await api.close()
        if project_api is not None:
            await project_api.close()
        if gist_api is not None:
            await gist_api.close()
        await router.aclose()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one Elixpoo v2 project-management operation")
    parser.add_argument("mode", choices=("triage", "mention", "review", "merge-memory"))
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args.mode)))


if __name__ == "__main__":
    main()
