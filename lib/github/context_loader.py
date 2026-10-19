"""Load full context from a GitHub issue or PR for the agent."""

from __future__ import annotations

import structlog

from lib.github.api import GitHubAPI

log = structlog.get_logger()


class GitHubContext:
    """Structured context extracted from a GitHub event."""

    def __init__(self):
        self.repo_full_name: str = ""
        self.owner: str = ""
        self.repo: str = ""
        self.default_branch: str = "main"
        self.event_type: str = ""  # "issue" or "pull_request"
        self.number: int = 0
        self.title: str = ""
        self.body: str = ""
        self.author: str = ""
        self.labels: list[str] = []
        self.comments: list[dict] = []
        self.diff: str | None = None  # PR only
        self.changed_files: list[dict] = []  # PR only
        self.file_tree: list[str] = []
        self.trigger_comment: str = ""  # The comment that mentioned the bot

    def to_prompt(self) -> str:
        """Format the context as a prompt string for the agent."""
        parts = []

        parts.append(f"## Repository: {self.repo_full_name}")
        parts.append(f"Default branch: {self.default_branch}\n")

        if self.event_type == "issue":
            parts.append(f"## Issue #{self.number}: {self.title}")
        else:
            parts.append(f"## Pull Request #{self.number}: {self.title}")

        parts.append(f"Author: {self.author}")
        if self.labels:
            parts.append(f"Labels: {', '.join(self.labels)}")
        parts.append("")

        if self.body:
            parts.append("### Description")
            parts.append(self.body)
            parts.append("")

        if self.comments:
            parts.append("### Comments")
            for c in self.comments[-10:]:  # Last 10 comments
                parts.append(f"**{c['user']}**: {c['body'][:500]}")
            parts.append("")

        if self.diff:
            # Truncate large diffs
            diff = self.diff
            if len(diff) > 15000:
                diff = diff[:15000] + "\n... (diff truncated)"
            parts.append("### Diff")
            parts.append(f"```diff\n{diff}\n```")
            parts.append("")

        if self.changed_files:
            parts.append("### Changed Files")
            for f in self.changed_files:
                parts.append(f"- {f['filename']} (+{f.get('additions', 0)} -{f.get('deletions', 0)})")
            parts.append("")

        if self.file_tree:
            parts.append("### Repository Structure (top-level)")
            for f in self.file_tree[:100]:
                parts.append(f"  {f}")
            if len(self.file_tree) > 100:
                parts.append(f"  ... ({len(self.file_tree)} files total)")
            parts.append("")

        if self.trigger_comment:
            parts.append("### Task (from mention)")
            parts.append(self.trigger_comment)

        return "\n".join(parts)


async def load_issue_context(
    api: GitHubAPI,
    owner: str,
    repo: str,
    issue_number: int,
    trigger_comment: str = "",
) -> GitHubContext:
    """Load full context for a GitHub issue."""
    ctx = GitHubContext()
    ctx.owner = owner
    ctx.repo = repo
    ctx.repo_full_name = f"{owner}/{repo}"
    ctx.event_type = "issue"
    ctx.number = issue_number
    ctx.trigger_comment = trigger_comment

    # Load issue details
    issue = await api.get_issue(owner, repo, issue_number)
    ctx.title = issue.get("title", "")
    ctx.body = issue.get("body", "") or ""
    ctx.author = issue.get("user", {}).get("login", "")
    ctx.labels = [lb["name"] for lb in issue.get("labels", [])]

    # Load comments
    comments = await api.get_issue_comments(owner, repo, issue_number)
    ctx.comments = [
        {"user": c["user"]["login"], "body": c["body"]}
        for c in comments
    ]

    # Load repo info
    ctx.default_branch = await api.get_default_branch(owner, repo)

    # Load file tree
    try:
        tree = await api.get_tree(owner, repo, ctx.default_branch)
        ctx.file_tree = [item["path"] for item in tree.get("tree", []) if item["type"] == "blob"]
    except Exception as e:
        log.warning("context.tree_load_failed", error=str(e))

    return ctx


async def load_pr_context(
    api: GitHubAPI,
    owner: str,
    repo: str,
    pr_number: int,
    trigger_comment: str = "",
) -> GitHubContext:
    """Load full context for a GitHub pull request."""
    ctx = GitHubContext()
    ctx.owner = owner
    ctx.repo = repo
    ctx.repo_full_name = f"{owner}/{repo}"
    ctx.event_type = "pull_request"
    ctx.number = pr_number
    ctx.trigger_comment = trigger_comment

    # Load PR details
    pr = await api.get_pull(owner, repo, pr_number)
    ctx.title = pr.get("title", "")
    ctx.body = pr.get("body", "") or ""
    ctx.author = pr.get("user", {}).get("login", "")
    ctx.labels = [lb["name"] for lb in pr.get("labels", [])]
    ctx.default_branch = pr.get("base", {}).get("ref", "main")

    # Load diff
    try:
        ctx.diff = await api.get_pull_diff(owner, repo, pr_number)
    except Exception as e:
        log.warning("context.diff_load_failed", error=str(e))

    # Load changed files
    try:
        files = await api.get_pull_files(owner, repo, pr_number)
        ctx.changed_files = [
            {
                "filename": f["filename"],
                "status": f["status"],
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0),
            }
            for f in files
        ]
    except Exception as e:
        log.warning("context.files_load_failed", error=str(e))

    # Load PR comments
    try:
        comments = await api.get_pull_comments(owner, repo, pr_number)
        ctx.comments = [
            {"user": c["user"]["login"], "body": c["body"]}
            for c in comments
        ]
    except Exception:
        pass

    # Load file tree
    try:
        tree = await api.get_tree(owner, repo, ctx.default_branch)
        ctx.file_tree = [item["path"] for item in tree.get("tree", []) if item["type"] == "blob"]
    except Exception:
        pass

    return ctx
