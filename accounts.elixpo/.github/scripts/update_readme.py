#!/usr/bin/env python3
"""
README Update Checker — accounts.elixpo
Runs on PR merge to determine if a major change warrants README or
repository description updates. If so, opens an issue with suggestions.
"""

import json
import os
import re
import sys
import urllib.error

# ── Config import ──────────────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import (
    CORE_PATHS,
    LLM_MODEL_CHAT,
    PROJECT_DESCRIPTION,
    PROJECT_NAME,
)
from _common import github_rest, call_llm, parse_llm_json

# ── Environment variables ──────────────────────────────────────────────────
AGENT_TOKEN = os.environ["AGENT_TOKEN"]
POLLINATIONS_KEY = os.environ.get("POLLINATIONS_KEY", "")
PR_NUMBER = os.environ["PR_NUMBER"]
REPO = os.environ["REPO"]

# ── Keywords that signal a major change ────────────────────────────────────
MAJOR_KEYWORDS = re.compile(
    r"\b(breaking|major|redesign|migration)\b", re.IGNORECASE
)

# ── Core paths (per-repo, from ci_config.CORE_PATHS) ──────────────────────
# Changes touching these prefixes increase the major-change score.
CORE_AUTH_PREFIXES = tuple(CORE_PATHS)


# ── PR data ────────────────────────────────────────────────────────────────
def fetch_pr() -> dict:
    """Fetch PR metadata (title, body, etc.)."""
    return github_rest("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}")


def fetch_changed_files() -> list[str]:
    """Return the list of filenames changed in the PR (handles pagination)."""
    files: list[str] = []
    page = 1
    while True:
        resp = github_rest(
            "GET",
            f"/repos/{REPO}/pulls/{PR_NUMBER}/files?per_page=100&page={page}",
        )
        if not resp:
            break
        files.extend(f["filename"] for f in resp)
        if len(resp) < 100:
            break
        page += 1
    return files


# ── Major-change heuristic ─────────────────────────────────────────────────
def is_major_change(
    title: str, body: str, changed_files: list[str]
) -> tuple[bool, list[str]]:
    """Determine if the PR constitutes a major change.

    Returns (is_major, list_of_reasons).
    """
    reasons: list[str] = []

    # 1. High file count
    if len(changed_files) > 10:
        reasons.append(f"{len(changed_files)} files changed (>10)")

    # 2. Dependency changes
    dep_files = [f for f in changed_files if f.endswith("package.json")]
    if dep_files:
        reasons.append(f"Dependency file(s) changed: {', '.join(dep_files)}")

    # 3. New top-level directories — a file like "newdir/anything" where
    #    "newdir" didn't exist before is approximated by checking if the
    #    first path segment is new relative to the rest of the changed files.
    #    We check for added files whose top-level directory has only additions.
    top_level_dirs = {f.split("/")[0] for f in changed_files if "/" in f}
    common_top_dirs = {"src", "app", "public", ".github", "node_modules", ".next"}
    new_dirs = top_level_dirs - common_top_dirs
    if new_dirs:
        reasons.append(f"New top-level directory candidate(s): {', '.join(sorted(new_dirs))}")

    # 4. Core auth/OAuth files
    auth_files = [
        f for f in changed_files
        if any(f.startswith(prefix) for prefix in CORE_AUTH_PREFIXES)
    ]
    if auth_files:
        reasons.append(f"Core auth file(s) changed: {', '.join(auth_files[:5])}")

    # 5. Keywords in title or body
    text = f"{title} {body or ''}"
    if MAJOR_KEYWORDS.search(text):
        reasons.append("PR title/body contains major-change keyword")

    return bool(reasons), reasons


# ── Fetch current README ───────────────────────────────────────────────────
def fetch_readme() -> str:
    """Fetch the decoded README.md content from the default branch."""
    import base64

    data = github_rest("GET", f"/repos/{REPO}/contents/README.md")
    return base64.b64decode(data["content"]).decode()


# ── LLM call ──────────────────────────────────────────────────────────────
def analyze_readme(pr_title: str, pr_body: str, changed_files: list[str], readme: str) -> dict:
    """Ask the LLM whether the README needs updating. Returns parsed JSON."""
    system_prompt = (
        f"You are a technical writer. A major change was merged into "
        f"{PROJECT_NAME} ({PROJECT_DESCRIPTION}).\n"
        "Based on the PR changes, suggest minimal updates to the README.\n"
        "Only suggest changes if the README is actually outdated or missing "
        "info about the new changes.\n"
        'If the README doesn\'t need updating, respond with: {"update_needed": false}\n'
        "If it does, respond with: "
        '{"update_needed": true, "sections_to_update": ["section name"], '
        '"suggested_changes": "brief description", '
        '"new_description": "one-line repo description if it should change, or null"}\n'
        "Respond in JSON only."
    )

    user_message = (
        f"## PR #{PR_NUMBER}: {pr_title}\n\n"
        f"{pr_body or '(no description)'}\n\n"
        f"### Changed files ({len(changed_files)}):\n"
        + "\n".join(f"- {f}" for f in changed_files[:50])
        + ("\n... and more" if len(changed_files) > 50 else "")
        + f"\n\n### Current README.md:\n```\n{readme[:4000]}\n```"
    )

    content = call_llm(LLM_MODEL_CHAT, system_prompt, user_message, json_mode=True)
    return parse_llm_json(content)


# ── Actions ────────────────────────────────────────────────────────────────
def open_issue(pr_number: str, suggestions: dict) -> str:
    """Open a GitHub issue with the suggested README changes. Returns the issue URL."""
    sections = ", ".join(suggestions.get("sections_to_update", []))
    description = suggestions.get("suggested_changes", "No details provided.")
    new_desc = suggestions.get("new_description")

    body_parts = [
        f"PR #{pr_number} introduced major changes that may require README updates.\n",
        f"**Sections to update:** {sections}\n",
        f"**Suggested changes:** {description}\n",
    ]
    if new_desc:
        body_parts.append(f"**Suggested new repo description:** {new_desc}\n")

    body_parts.append(
        f"\n---\n*Auto-generated by the README update checker on PR merge.*"
    )

    result = github_rest("POST", f"/repos/{REPO}/issues", {
        "title": f"Update README after PR #{pr_number}",
        "body": "\n".join(body_parts),
    })
    return result["html_url"]


def update_repo_description(new_description: str) -> None:
    """Update the repository description via the REST API."""
    github_rest("PATCH", f"/repos/{REPO}", {
        "description": new_description,
    })


# ── Main ──────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"=== README Update Check: PR #{PR_NUMBER} ===")

    # ── Step 1: Fetch PR data ─────────────────────────────────────────────
    print("Fetching PR data...")
    pr = fetch_pr()
    pr_title = pr["title"]
    pr_body = pr.get("body") or ""
    print(f"Title: {pr_title}")

    print("Fetching changed files...")
    changed_files = fetch_changed_files()
    print(f"Files changed: {len(changed_files)}")

    # ── Step 2: Check if major ────────────────────────────────────────────
    major, reasons = is_major_change(pr_title, pr_body, changed_files)

    if not major:
        print("No major changes detected, skipping.")
        return

    print("Major change detected:")
    for reason in reasons:
        print(f"  - {reason}")

    # ── Step 3: Fetch README and consult LLM ──────────────────────────────
    print("Fetching current README.md...")
    try:
        readme = fetch_readme()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print("No README.md found in repo, using empty string.")
            readme = ""
        else:
            raise

    print("Calling LLM for README analysis...")
    try:
        llm_result = analyze_readme(pr_title, pr_body, changed_files, readme)
        print(f"LLM response: {json.dumps(llm_result)}")
    except Exception as exc:
        print(f"[error] LLM call failed: {exc}")
        print("Skipping README update suggestions.")
        return

    if not llm_result.get("update_needed"):
        print("LLM determined README does not need updating.")
        return

    # ── Step 4: Open issue with suggestions ───────────────────────────────
    print("Opening issue with README update suggestions...")
    issue_url = open_issue(PR_NUMBER, llm_result)
    print(f"Issue created: {issue_url}")

    # ── Step 5: Update repo description if suggested ──────────────────────
    new_description = llm_result.get("new_description")
    if new_description:
        print(f"Updating repo description to: {new_description}")
        try:
            update_repo_description(new_description)
            print("Repo description updated.")
        except Exception as exc:
            print(f"[warn] Failed to update repo description: {exc}")
    else:
        print("No repo description change suggested.")

    print("=== README update check complete ===")


if __name__ == "__main__":
    main()
