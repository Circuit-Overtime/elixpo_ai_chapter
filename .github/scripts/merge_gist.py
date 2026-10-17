#!/usr/bin/env python3
"""
merge_gist.py — Runs on PR merge.
  1. Creates/updates a Gist changelog entry (via Pollinations LLM).
  2. Closes issues linked to the merged PR.

Env vars: AGENT_TOKEN (@elixpoo PAT with repo + gist scope),
          POLLINATIONS_KEY, PR_NUMBER, REPO
"""

import os
import re
import sys
from datetime import datetime, timezone

# ── Config import ──────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *  # noqa: F401, F403
from _common import github_rest, call_llm

# ── Environment ────────────────────────────────────────
# AGENT_TOKEN is a PAT for @elixpoo with both repo and gist scopes — used for
# PR/issue ops AND gist ops so every action appears as the @elixpoo user.
AGENT_TOKEN = os.environ["AGENT_TOKEN"]
POLLINATIONS_KEY = os.environ["POLLINATIONS_KEY"]
PR_NUMBER = os.environ["PR_NUMBER"]
REPO = os.environ.get("REPO", globals().get("REPO", ""))


# ── Helpers ────────────────────────────────────────────
def llm_summarize(title, body, files):
    """Call Pollinations LLM for a changelog summary. Returns plain text."""
    user_content = (
        f"PR Title: {title}\n\n"
        f"PR Body:\n{body or '(no description)'}\n\n"
        f"Changed files:\n{chr(10).join(files)}"
    )
    system_prompt = (
        "You are a changelog writer. Write a 2-3 sentence summary "
        "of this PR for a public changelog. Be concise and factual. "
        "No markdown formatting."
    )
    try:
        return call_llm(LLM_MODEL_CHAT, system_prompt, user_content).strip()
    except Exception as exc:
        print(f"[WARN] LLM call failed ({exc}), falling back to PR title", file=sys.stderr)
        return title


# ── Part 1: Gist Digest ──────────────────────────────
def run_gist_digest():
    """Fetch PR data, generate summary, create/update gist, comment on PR."""
    pr = github_rest("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}")

    title = pr["title"]
    body = pr.get("body") or ""
    merged_by = pr.get("merged_by", {}).get("login", "unknown")

    # Fetch changed files
    files_data = github_rest(
        "GET", f"/repos/{REPO}/pulls/{PR_NUMBER}/files?per_page=100"
    )
    filenames = [f["filename"] for f in files_data]

    # LLM summary
    summary = llm_summarize(title, body, filenames)

    # Format entry
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key_files = ", ".join(filenames[:10])
    if len(filenames) > 10:
        key_files += f" (+{len(filenames) - 10} more)"

    entry = (
        f"## PR #{PR_NUMBER} — {title} ({date_str})\n"
        f"Merged by: @{merged_by}\n"
        f"{summary}\n"
        f"Files: {key_files}\n"
        f"\n---\n\n"
    )

    # Prefer GIST_ID from env (populated from repo variable CI_GIST_ID by the
    # workflow) so it persists across runs. Fall back to ci_config.py value.
    gist_id = os.environ.get("GIST_ID", "").strip() or globals().get("GIST_ID", "")
    gist_filename = f"{PROJECT_NAME}-changelog.md"
    gist_url = ""

    if gist_id:
        # Update existing gist — prepend new entry
        gist_data = github_rest("GET", f"/gists/{gist_id}")
        existing = gist_data["files"].get(gist_filename, {}).get("content", "")
        new_content = entry + existing
        github_rest(
            "PATCH",
            f"/gists/{gist_id}",
            {"files": {gist_filename: {"content": new_content}}},
        )
        gist_url = gist_data["html_url"]
        print(f"Gist updated: {gist_url}")
    else:
        # Create new public gist
        gist_payload = {
            "description": f"{PROJECT_NAME} — Change Log",
            "public": True,
            "files": {gist_filename: {"content": entry}},
        }
        created = github_rest("POST", "/gists", gist_payload)
        gist_url = created["html_url"]
        new_gist_id = created["id"]
        print(f"GIST_ID={new_gist_id}")
        print(f"Gist created: {gist_url}")

    # Comment on the merged PR
    github_rest(
        "POST",
        f"/repos/{REPO}/issues/{PR_NUMBER}/comments",
        {"body": f"**[CHANGE LOG]** \U0001f4cb Changelog updated for PR #{PR_NUMBER}. [View changelog]({gist_url})"},
    )
    print(f"Commented on PR #{PR_NUMBER}")


# ── Part 2: Close Linked Issues ──────────────────────
def find_linked_issues():
    """Scan PR title, body, branch, and commits for linked issue numbers."""
    pr = github_rest("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}")

    sources = [
        pr.get("title") or "",
        pr.get("body") or "",
        pr.get("head", {}).get("ref") or "",
    ]

    # Fetch commit messages
    try:
        commits = github_rest(
            "GET", f"/repos/{REPO}/pulls/{PR_NUMBER}/commits?per_page=100"
        )
        for c in commits:
            msg = c.get("commit", {}).get("message", "")
            sources.append(msg)
    except Exception as exc:
        print(f"[WARN] Could not fetch commits: {exc}", file=sys.stderr)

    issue_numbers = set()

    # Pattern: Closes/Fixes/Resolves #N
    keyword_pattern = re.compile(r"(?:closes|fixes|resolves)\s+#(\d+)", re.IGNORECASE)
    for text in sources:
        for match in keyword_pattern.finditer(text):
            issue_numbers.add(int(match.group(1)))

    # Pattern: branch name matching */issue-N
    branch = pr.get("head", {}).get("ref") or ""
    branch_pattern = re.compile(r"issue-(\d+)")
    for match in branch_pattern.finditer(branch):
        issue_numbers.add(int(match.group(1)))

    return issue_numbers


def close_linked_issues():
    """Close each linked issue with a comment."""
    issue_numbers = find_linked_issues()
    if not issue_numbers:
        print("No linked issues found.")
        return

    for num in sorted(issue_numbers):
        issue_path = f"/repos/{REPO}/issues/{num}"
        try:
            issue = github_rest("GET", issue_path)
        except Exception as exc:
            print(f"[WARN] Could not fetch issue #{num}: {exc}", file=sys.stderr)
            continue

        # Skip if already closed or if it's a pull request
        if issue.get("state") != "open":
            print(f"Issue #{num} is not open (state={issue.get('state')}), skipping.")
            continue
        if issue.get("pull_request"):
            print(f"#{num} is a pull request, skipping.")
            continue

        # Close the issue
        try:
            github_rest(
                "PATCH",
                issue_path,
                {"state": "closed", "state_reason": "completed"},
            )
            print(f"Closed issue #{num}")
        except Exception as exc:
            print(f"[ERROR] Failed to close issue #{num}: {exc}", file=sys.stderr)
            continue

        # Post comment
        try:
            github_rest(
                "POST",
                f"{issue_path}/comments",
                {"body": f"Closed by PR #{PR_NUMBER}"},
            )
        except Exception as exc:
            print(f"[WARN] Failed to comment on issue #{num}: {exc}", file=sys.stderr)


# ── Main ──────────────────────────────────────────────
def main():
    print(f"=== merge_gist.py — PR #{PR_NUMBER} in {REPO} ===")

    print("\n--- Part 1: Gist Digest ---")
    try:
        run_gist_digest()
    except Exception as exc:
        print(f"[ERROR] Gist digest failed: {exc}", file=sys.stderr)

    print("\n--- Part 2: Close Linked Issues ---")
    try:
        close_linked_issues()
    except Exception as exc:
        print(f"[ERROR] Issue closing failed: {exc}", file=sys.stderr)

    print("\nDone.")


if __name__ == "__main__":
    main()
