"""Typed v2 actions, authorization, refusal, and idempotency primitives."""

from __future__ import annotations

import hashlib
import re
from enum import IntEnum
from typing import Any, Literal

from lib.elixpoo_policy import CODING_REFUSAL_TEXT, is_coding_request_text
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DISCLOSURE = "_Posted by @elixpoo, Elixpo's automated project-management agent._"
PUBLIC_MARKER_PREFIX = "<!-- elixpoo:v2:"
_MENTION = re.compile(r"(?<![A-Za-z0-9_.+\-])@elixpoo(?![A-Za-z0-9_.+\-])", re.IGNORECASE)
_INJECTION = re.compile(
    r"(?im)^\s*(system|assistant|developer)\s*:|ignore (all|any|the|your) .*instructions|"
    r"reveal .*?(secret|token|prompt)|follow .*?(instructions|commands) (above|below|inside)",
)


class PermissionTier(IntEnum):
    NONE = 0
    READ = 1
    TRIAGE = 2
    WRITE = 3
    MAINTAIN = 4
    ADMIN = 5


_PERMISSIONS = {
    "none": PermissionTier.NONE,
    "read": PermissionTier.READ,
    "triage": PermissionTier.TRIAGE,
    "write": PermissionTier.WRITE,
    "maintain": PermissionTier.MAINTAIN,
    "admin": PermissionTier.ADMIN,
}


class MetadataAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal[
        "answer",
        "summarize",
        "review",
        "rewrite_title",
        "rewrite_body",
        "labels",
        "project_field",
        "assignment",
        "refuse",
    ]
    response: str = Field(min_length=1, max_length=4000)
    title: str | None = Field(default=None, min_length=3, max_length=256)
    body: str | None = Field(default=None, max_length=20_000)
    add_labels: tuple[str, ...] = ()
    remove_labels: tuple[str, ...] = ()
    project_fields: dict[str, str] = Field(default_factory=dict)
    assignees: tuple[str, ...] = ()
    preview_only: bool = True

    @model_validator(mode="after")
    def required_payload(self) -> MetadataAction:
        if self.kind == "rewrite_title" and not self.title:
            raise ValueError("rewrite_title requires title")
        if self.kind == "rewrite_body" and self.body is None:
            raise ValueError("rewrite_body requires body")
        return self

    @field_validator("add_labels", "remove_labels", "assignees")
    @classmethod
    def unique_values(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(dict.fromkeys(value.strip() for value in values if value.strip()))


class ReviewFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    severity: Literal["blocking", "suggestion"]
    path: str = Field(min_length=1, max_length=500)
    line: int = Field(ge=1)
    title: str = Field(min_length=3, max_length=160)
    evidence: str = Field(min_length=3, max_length=1000)
    recommendation: str = Field(min_length=3, max_length=1000)


class PullReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=2000)
    findings: tuple[ReviewFinding, ...] = ()


def contains_exact_mention(text: str) -> bool:
    return bool(_MENTION.search(text or ""))


def is_coding_request(text: str) -> bool:
    return is_coding_request_text(text)


def coding_refusal() -> MetadataAction:
    return MetadataAction(
        kind="refuse",
        response=CODING_REFUSAL_TEXT,
    )


def sanitize_evidence(text: str, limit: int = 24_000) -> str:
    """Retain evidence while neutralizing common instruction-shaped content."""
    redacted = _INJECTION.sub("[untrusted instruction removed]", text or "")
    redacted = re.sub(r"(?i)(token|secret|password|authorization)\s*[:=]\s*\S+", r"\1=[redacted]", redacted)
    return redacted[:limit]


def permission_tier(value: str | None) -> PermissionTier:
    return _PERMISSIONS.get(str(value or "none").casefold(), PermissionTier.NONE)


def authorize_action(
    action: MetadataAction,
    *,
    permission: PermissionTier,
    actor: str,
    author: str,
    assignable: set[str] | None = None,
) -> MetadataAction:
    """Return the same action as a mutation or force it into preview mode."""
    required = PermissionTier.READ
    if action.kind in {"rewrite_title", "rewrite_body"}:
        required = PermissionTier.READ if actor.casefold() == author.casefold() else PermissionTier.TRIAGE
    elif action.kind in {"labels", "project_field"}:
        required = PermissionTier.TRIAGE
    elif action.kind == "assignment":
        self_only = set(action.assignees) <= {actor} and actor in (assignable or set())
        required = PermissionTier.READ if self_only else PermissionTier.TRIAGE
    can_mutate = action.kind not in {"answer", "summarize", "review", "refuse"} and permission >= required
    return action.model_copy(update={"preview_only": not can_mutate})


def validate_allowlists(action: MetadataAction, *, labels: set[str], fields: dict[str, set[str]]) -> None:
    unknown_labels = (set(action.add_labels) | set(action.remove_labels)) - labels
    if unknown_labels:
        raise ValueError(f"labels are outside the central allowlist: {sorted(unknown_labels)}")
    for name, value in action.project_fields.items():
        if name not in fields or value not in fields[name]:
            raise ValueError(f"unsupported Project field value: {name}={value}")


def event_key(repository: str, kind: str, number: int, revision: str) -> str:
    material = f"{repository.casefold()}|{kind}|{number}|{revision}"
    return hashlib.sha256(material.encode()).hexdigest()[:24]


def marker(operation: str, key: str) -> str:
    safe = re.sub(r"[^a-z0-9_.:-]", "-", f"{operation}:{key}".casefold())
    return f"{PUBLIC_MARKER_PREFIX}{safe} -->"


def public_body(text: str, operation: str, key: str) -> str:
    return f"{text.strip()}\n\n{DISCLOSURE}\n\n{marker(operation, key)}"


def has_marker(records: list[dict[str, Any]], operation: str, key: str) -> bool:
    expected = marker(operation, key)
    return any(expected in str(record.get("body") or "") for record in records)


def route_comment(issue: dict[str, Any]) -> Literal["issue", "pull_request"]:
    return "pull_request" if issue.get("pull_request") else "issue"


def review_marker(head_sha: str) -> str:
    return marker("review", head_sha)
