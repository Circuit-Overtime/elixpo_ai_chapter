"""Typed view over state/ledger.json — the PR registry, blocklist, daily cap.

Legacy schema is documented under docs/archive/autonomous-contributor/. Pure data + StateStore I/O, so
it's testable without GitHub. The daily cap (4-5 PRs/day) and the permanent
blocklist (opt-out) are enforced here.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from lib.state.store import StateStore

LEDGER_FILE = "ledger.json"
DAILY_PR_CAP = 5


class PRRecord(BaseModel):
    issue_url: str = ""
    pr_url: str = ""
    tracking_issue: str = ""
    status: str = "claimed"  # claimed | solving | awaiting_review | changes_requested | merged | closed
    opened_at: str = ""
    last_event: str = ""
    token_spend: int = 0
    model_cascade: list[str] = Field(default_factory=list)
    fork_url: str = ""


class Ledger(BaseModel):
    prs: dict[str, PRRecord] = Field(default_factory=dict)
    blocklist: list[str] = Field(default_factory=list)
    daily_count: dict[str, int] = Field(default_factory=dict)

    # --- load / save ---

    @classmethod
    def load(cls, store: StateStore) -> Ledger:
        if store.read_json(LEDGER_FILE, None) is None:
            return cls()
        return cls(**(store.read_state(LEDGER_FILE, {}, expected_producer={"ledger", "migration"}) or {}))

    def save(self, store: StateStore) -> None:
        store.write_state(LEDGER_FILE, self.model_dump(), producer="ledger")

    # --- blocklist (opt-out is permanent) ---

    def is_blocked(self, repo: str) -> bool:
        return repo in self.blocklist

    def block(self, repo: str) -> None:
        if repo not in self.blocklist:
            self.blocklist.append(repo)

    # --- daily cap ---

    def count_today(self, day: str) -> int:
        return self.daily_count.get(day, 0)

    def can_open_today(self, day: str) -> bool:
        return self.count_today(day) < DAILY_PR_CAP

    def record_pr(self, key: str, record: PRRecord, day: str) -> None:
        """Register a new PR and bump the daily counter (key = 'owner/repo#NNN')."""
        self.prs[key] = record
        self.daily_count[day] = self.count_today(day) + 1

    def set_status(self, key: str, status: str, last_event: str = "") -> None:
        if key in self.prs:
            self.prs[key].status = status
            if last_event:
                self.prs[key].last_event = last_event

    def open_pr_for_repo(self, repo: str) -> str | None:
        """Return the key of an open PR for `repo`, enforcing 1-open-PR-per-repo."""
        for key, rec in self.prs.items():
            if key.startswith(f"{repo}#") and rec.status not in ("merged", "closed"):
                return key
        return None
