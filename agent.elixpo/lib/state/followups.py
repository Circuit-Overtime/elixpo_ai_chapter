"""Typed shared memory for submitted work that still needs stewardship."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field

FOLLOWUP_TTL_MIN_DAYS = 60
FOLLOWUP_TTL_MAX_DAYS = 360
FOLLOWUP_TTL_DEFAULT_DAYS = 360
FOLLOWUP_COMPLETION_LIMIT = 200


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def bounded_ttl_days(value: int) -> int:
    return max(FOLLOWUP_TTL_MIN_DAYS, min(int(value), FOLLOWUP_TTL_MAX_DAYS))


class FollowupRecord(BaseModel):
    key: str
    repository: str
    subject_kind: str = "pull_request"
    subject_number: int
    subject_url: str
    issue_url: str = ""
    title: str = ""
    branch: str = ""
    fork_repository: str = ""
    status: str = "awaiting_review"
    opened_at: str
    updated_at: str
    expires_at: str
    handled_comment_ids: list[int] = Field(default_factory=list)
    head_sha: str = ""
    pending_action: dict = Field(default_factory=dict)
    last_fix_fingerprint: str = ""
    fix_attempts: dict[str, int] = Field(default_factory=dict)
    last_error: str = ""

    @classmethod
    def create(
        cls,
        *,
        repository: str,
        subject_number: int,
        subject_url: str,
        issue_url: str = "",
        title: str = "",
        branch: str = "",
        fork_repository: str = "",
        subject_kind: str = "pull_request",
        status: str = "awaiting_review",
        ttl_days: int = FOLLOWUP_TTL_DEFAULT_DAYS,
        now: datetime | None = None,
    ) -> FollowupRecord:
        current = now or utc_now()
        stamp = current.isoformat()
        return cls(
            key=f"{repository}#{subject_number}",
            repository=repository,
            subject_kind=subject_kind,
            subject_number=subject_number,
            subject_url=subject_url,
            issue_url=issue_url,
            title=title[:300],
            branch=branch,
            fork_repository=fork_repository,
            status=status,
            opened_at=stamp,
            updated_at=stamp,
            expires_at=(current + timedelta(days=bounded_ttl_days(ttl_days))).isoformat(),
        )

    def remember_comment(self, comment_id: int, *, now: datetime | None = None) -> None:
        if comment_id not in self.handled_comment_ids:
            self.handled_comment_ids.append(comment_id)
            self.handled_comment_ids = self.handled_comment_ids[-200:]
        self.updated_at = (now or utc_now()).isoformat()

    def queue_action(self, action: dict, *, now: datetime | None = None) -> bool:
        """Record a new action once; return false for an identical pending receipt."""
        fingerprint = str(action.get("fingerprint") or "")
        if not fingerprint:
            raise ValueError("follow-up action fingerprint is required")
        if str(self.pending_action.get("fingerprint") or "") == fingerprint:
            return False
        self.pending_action = dict(action)
        self.updated_at = (now or utc_now()).isoformat()
        return True

    def clear_action(self, *, now: datetime | None = None) -> None:
        self.pending_action = {}
        self.last_error = ""
        self.updated_at = (now or utc_now()).isoformat()


class FollowupCompletion(BaseModel):
    key: str
    repository: str
    subject_url: str
    outcome: str
    completed_at: str


class FollowupMemory(BaseModel):
    schema_version: int = 1
    active: dict[str, FollowupRecord] = Field(default_factory=dict)
    completed: list[FollowupCompletion] = Field(default_factory=list)
    updated_at: str = ""

    def upsert(self, record: FollowupRecord, *, now: datetime | None = None) -> None:
        previous = self.active.get(record.key)
        if previous:
            record.opened_at = previous.opened_at
            record.handled_comment_ids = list(
                dict.fromkeys([*previous.handled_comment_ids, *record.handled_comment_ids])
            )[-200:]
        current = now or utc_now()
        record.updated_at = current.isoformat()
        self.active[record.key] = record
        self.updated_at = current.isoformat()

    def complete(self, key: str, outcome: str, *, now: datetime | None = None) -> FollowupCompletion | None:
        record = self.active.pop(key, None)
        if record is None:
            return None
        current = now or utc_now()
        completion = FollowupCompletion(
            key=record.key,
            repository=record.repository,
            subject_url=record.subject_url,
            outcome=outcome,
            completed_at=current.isoformat(),
        )
        self.completed.append(completion)
        self.completed = self.completed[-FOLLOWUP_COMPLETION_LIMIT:]
        self.updated_at = current.isoformat()
        return completion

    def prune_expired(self, *, now: datetime | None = None) -> list[FollowupCompletion]:
        current = now or utc_now()
        expired = [key for key, record in self.active.items() if parse_time(record.expires_at) <= current]
        return [completion for key in expired if (completion := self.complete(key, "expired", now=current))]
