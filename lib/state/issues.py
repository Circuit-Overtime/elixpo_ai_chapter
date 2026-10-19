"""Control-repo issues as state.

Each external PR gets a tracking issue; each discovered candidate gets a
candidate issue. State lives in labels (the Project board columns map to state
labels). Thin, stable wrappers over GitHubAPI — squads add the LLM reasoning.
"""

from __future__ import annotations

from typing import Any

from lib.github.api import GitHubAPI

# state labels (also the Project board columns)
LABEL_TRIAGED = "triaged"
LABEL_CLAIMED = "claimed"
LABEL_SOLVING = "solving"
LABEL_AWAITING_REVIEW = "awaiting_review"
LABEL_MERGED = "merged"
LABEL_CLOSED = "closed"


def tracking_title(owner: str, repo: str, number: int, short: str) -> str:
    """'[owner/repo#NNN] short description' — the tracking-issue title format."""
    return f"[{owner}/{repo}#{number}] {short}"


class ControlIssues:
    def __init__(self, api: GitHubAPI, control_repo: str):
        self.api = api
        self.owner, self.repo = control_repo.split("/", 1)

    async def create(self, title: str, body: str, labels: list[str]) -> dict[str, Any]:
        return await self.api._request(
            "POST",
            f"/repos/{self.owner}/{self.repo}/issues",
            json={"title": title, "body": body, "labels": labels},
        )

    async def set_labels(self, number: int, labels: list[str]) -> Any:
        return await self.api._request(
            "PUT",
            f"/repos/{self.owner}/{self.repo}/issues/{number}/labels",
            json={"labels": labels},
        )

    async def list_by_label(self, label: str, state: str = "open") -> list[dict[str, Any]]:
        return await self.api._request(
            "GET",
            f"/repos/{self.owner}/{self.repo}/issues",
            params={"labels": label, "state": state, "per_page": 100},
        )

    async def comment(self, number: int, body: str) -> dict[str, Any]:
        return await self.api.create_issue_comment(self.owner, self.repo, number, body)
