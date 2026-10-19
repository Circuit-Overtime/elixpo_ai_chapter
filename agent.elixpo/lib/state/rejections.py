"""Durable ledger of issue revisions that failed the final suitability check."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from lib.state.store import StateStore

REJECTIONS_FILE = "rejected_issues.json"


class RejectionRecord(BaseModel):
    url: str
    title: str = ""
    issue_updated_at: str = ""
    rejected_at: str
    reasons: list[str] = Field(default_factory=list)
    issue_kind: str = "unknown"
    confidence: float = 0.0


class RejectionLedger(BaseModel):
    issues: dict[str, RejectionRecord] = Field(default_factory=dict)

    @classmethod
    def load(cls, store: StateStore) -> RejectionLedger:
        if store.read_json(REJECTIONS_FILE, None) is None:
            return cls()
        return cls(
            **(
                store.read_state(
                    REJECTIONS_FILE, {}, expected_producer={"rejections", "migration"}
                )
                or {}
            )
        )

    def save(self, store: StateStore) -> None:
        store.write_state(REJECTIONS_FILE, self.model_dump(), producer="rejections")

    def rejects_unchanged(self, key: str, issue_updated_at: str) -> bool:
        """Skip only the rejected revision; new issue activity permits re-evaluation."""
        record = self.issues.get(key)
        return bool(record and record.issue_updated_at == issue_updated_at)

    def reject(
        self,
        key: str,
        *,
        url: str,
        title: str,
        issue_updated_at: str,
        reasons: list[str],
        issue_kind: str,
        confidence: float,
        now: datetime | None = None,
    ) -> None:
        now = now or datetime.now(timezone.utc)
        self.issues[key] = RejectionRecord(
            url=url,
            title=title,
            issue_updated_at=issue_updated_at,
            rejected_at=now.isoformat(),
            reasons=reasons,
            issue_kind=issue_kind,
            confidence=confidence,
        )

    def clear(self, key: str) -> None:
        self.issues.pop(key, None)
