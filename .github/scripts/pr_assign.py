"""
pr_assign.py — Assign PRs when opened.

Always assigns the PR author. For external contributors (not in ORG_MEMBERS),
uses the LLM to pick the best maintainer as a reviewer based on changed files,
title, and body. The chosen maintainer is also added as an assignee.

Env vars: AGENT_TOKEN, POLLINATIONS_KEY, PR_NUMBER, PR_TITLE, PR_BODY,
          PR_AUTHOR, REPO
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *
from _common import github_rest, call_llm, parse_llm_json


DEFAULT_REVIEWER = "Circuit-Overtime"


def safe_api(method, path, data=None, description=""):
    """Call github_rest and swallow errors (print + continue)."""
    try:
        return github_rest(method, path, data)
    except Exception as e:
        print(f"API error ({description or path}): {e}")
    return None


def pick_reviewer(pr_title, pr_body, changed_files):
    """Ask the LLM which maintainer should review. Falls back to DEFAULT_REVIEWER."""
    maintainer_lines = []
    for name, info in MAINTAINERS.items():
        skills = ", ".join(info.get("skills", []))
        role = info.get("role", "")
        maintainer_lines.append(f"- {name}: {role} (skills: {skills})")
    maintainers_block = "\n".join(maintainer_lines)

    system_prompt = (
        "You are a PR router. Pick the BEST maintainer to review this PR based on its content.\n\n"
        f"Available maintainers:\n{maintainers_block}\n\n"
        "Pick exactly ONE username. Consider:\n"
        "- File paths changed (frontend/backend/docs?)\n"
        "- PR title and description\n"
        "- Nature of the change (feature/bug/docs/infra?)\n\n"
        "Respond in JSON only: {\"reviewer\": \"username\", \"reason\": \"one sentence why\"}"
    )

    files_for_prompt = changed_files[:30]
    files_list = "\n".join(f"- {f}" for f in files_for_prompt) if files_for_prompt else "(none)"
    user_message = (
        f"Title: {pr_title}\n\n"
        f"Body: {pr_body}\n\n"
        f"Changed files:\n{files_list}"
    )

    try:
        raw = call_llm(LLM_MODEL_CHAT, system_prompt, user_message, temperature=0.2, json_mode=True)
        parsed = parse_llm_json(raw)
        reviewer = parsed.get("reviewer", "").strip()
        reason = parsed.get("reason", "").strip() or "selected by router"
        if reviewer not in MAINTAINERS:
            print(f"LLM returned invalid reviewer '{reviewer}'; falling back to {DEFAULT_REVIEWER}")
            return DEFAULT_REVIEWER, "default reviewer (LLM returned invalid maintainer)"
        return reviewer, reason
    except Exception as e:
        print(f"LLM call failed: {e}; falling back to {DEFAULT_REVIEWER}")
        return DEFAULT_REVIEWER, "default reviewer (LLM unavailable)"


def main():
    repo = os.environ.get("REPO", REPO)
    pr_number = os.environ["PR_NUMBER"]
    pr_author = os.environ.get("PR_AUTHOR", "").strip()
    pr_title = os.environ.get("PR_TITLE", "") or ""
    pr_body = os.environ.get("PR_BODY", "") or ""

    if not pr_author:
        print("PR_AUTHOR is empty; aborting.")
        return

    # 1. Always assign the PR author.
    safe_api(
        "POST",
        f"/repos/{repo}/issues/{pr_number}/assignees",
        {"assignees": [pr_author]},
        description="assign PR author",
    )
    print(f"Assigned PR #{pr_number} to author @{pr_author}")

    # 2. Org member? Nothing more to do — assignee is visible in the sidebar.
    if pr_author in ORG_MEMBERS:
        print("Org member opened PR; assignee set, no further action")
        return

    # 3. External contributor — fetch changed files and pick a reviewer.
    files_data = safe_api(
        "GET",
        f"/repos/{repo}/pulls/{pr_number}/files?per_page=100",
        description="list changed files",
    ) or []
    changed_files = [f.get("filename", "") for f in files_data if f.get("filename")]
    print(f"Changed files ({len(changed_files)}): {changed_files[:10]}{'...' if len(changed_files) > 10 else ''}")

    chosen, reason = pick_reviewer(pr_title, pr_body, changed_files)
    print(f"Chosen reviewer: {chosen} — {reason}")

    # 4. Request review (PR author cannot review their own PR).
    if chosen != pr_author:
        safe_api(
            "POST",
            f"/repos/{repo}/pulls/{pr_number}/requested_reviewers",
            {"reviewers": [chosen]},
            description="request reviewer",
        )
        print(f"Requested review from @{chosen}")
    else:
        print("Chosen reviewer matches PR author; skipping review request")

    # 5. Add the chosen maintainer as an assignee too.
    safe_api(
        "POST",
        f"/repos/{repo}/issues/{pr_number}/assignees",
        {"assignees": [chosen]},
        description="assign maintainer",
    )
    print(f"Added @{chosen} as assignee")
    # No summary comment — the assignee + review-request are already visible
    # in the PR sidebar. (LLM's reasoning stays in the job log.)
    print(f"Reviewer reasoning (log-only): {reason}")


if __name__ == "__main__":
    main()
