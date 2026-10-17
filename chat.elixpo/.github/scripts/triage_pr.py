#!/usr/bin/env python3
"""
PR Triage Bot — accounts.elixpo

Categorizes new pull requests and files them into the matching per-category
GitHub Project V2 board with an UPPERCASE category label.

Rules:
  - PRs opened by org members default to "Dev" (no LLM call).
  - PRs from external contributors: LLM picks the best-fit category based on
    the PR title, body, and list of changed files.

Env vars: AGENT_TOKEN, POLLINATIONS_KEY, PR_NUMBER, PR_AUTHOR, REPO
"""

import json
import os
import sys

# ── Config import ──────────────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *  # noqa: F401,F403
from _common import (
    github_rest,
    github_graphql,
    call_llm,
    parse_llm_json,
    ensure_label,
    add_labels,
)

# ── Environment ────────────────────────────────────────────────────────────
AGENT_TOKEN = os.environ["AGENT_TOKEN"]
POLLINATIONS_KEY = os.environ.get("POLLINATIONS_KEY", "")
PR_NUMBER = os.environ["PR_NUMBER"]
PR_AUTHOR = os.environ["PR_AUTHOR"]
REPO = os.environ["REPO"]

# ── Defaults ───────────────────────────────────────────────────────────────
DEFAULT_CATEGORY = "Dev"

# Label colors (same as issues — keep the palette consistent)
LABEL_COLORS = {
    "FEATURE": "a2eeef",
    "BUGS": "d73a4a",
    "SUPPORT": "cfd3d7",
    "DEV": "7057ff",
}


# ── LLM call ───────────────────────────────────────────────────────────────
def triage_llm(title: str, body: str, files: list[str]) -> dict:
    system_prompt = (
        f"You are a pull request triage bot for {PROJECT_NAME} ({PROJECT_DESCRIPTION}).\n"
        "Categorize this PR based on its title, body, and changed files.\n\n"
        "Categories:\n"
        "- Feature: adds new capability, enhancement, or UX improvement\n"
        "- Bugs: fixes a bug, regression, crash, or broken behavior\n"
        "- Support: answers a question, adds docs or examples for users\n"
        "- Dev: internal dev work — refactor, infra, CI, dependencies, chores\n\n"
        'Respond in JSON only: {"category": "Feature|Bugs|Support|Dev", "summary": "one sentence"}'
    )

    files_preview = "\n".join(f"- {f}" for f in files[:50]) or "(no files)"
    user_message = (
        f"PR title: {title}\n\n"
        f"PR body:\n{body or '(empty)'}\n\n"
        f"Changed files:\n{files_preview}"
    )

    content = call_llm(LLM_MODEL_CHAT, system_prompt, user_message, json_mode=True)
    return parse_llm_json(content)


# ── PR / Project V2 helpers ───────────────────────────────────────────────
def fetch_pr(pr_number: str) -> dict:
    return github_rest("GET", f"/repos/{REPO}/pulls/{pr_number}")


def fetch_pr_files(pr_number: str, limit: int = 100) -> list[str]:
    try:
        data = github_rest(
            "GET", f"/repos/{REPO}/pulls/{pr_number}/files?per_page={limit}"
        )
        if isinstance(data, list):
            return [f.get("filename", "") for f in data if f.get("filename")]
    except Exception as exc:
        print(f"[warn] Failed to fetch PR files: {exc}")
    return []


def add_to_project(project_id: str, pr_node_id: str) -> str | None:
    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item { id }
      }
    }
    """
    result = github_graphql(
        mutation, {"projectId": project_id, "contentId": pr_node_id}
    )
    try:
        return result["data"]["addProjectV2ItemById"]["item"]["id"]
    except (KeyError, TypeError):
        return None


def find_status_todo(project_id: str) -> tuple[str | None, str | None]:
    """Return (status_field_id, todo_option_id) for the project's Status field.
    Returns (None, None) if the field or Todo option isn't found — caller
    should log and skip rather than fail the whole triage.
    """
    query = """
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 30) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
        }
      }
    }
    """
    result = github_graphql(query, {"projectId": project_id})
    try:
        fields = result["data"]["node"]["fields"]["nodes"]
    except (KeyError, TypeError):
        return None, None
    for f in fields:
        if not f or f.get("name") != "Status":
            continue
        field_id = f.get("id")
        for opt in f.get("options") or []:
            if (opt.get("name") or "").strip().lower() == "todo":
                return field_id, opt.get("id")
    return None, None


def set_status_todo(project_id: str, item_id: str) -> bool:
    """Set the project item's Status field to 'Todo'. Idempotent on re-runs."""
    field_id, option_id = find_status_todo(project_id)
    if not field_id or not option_id:
        print("[warn] Status field or 'Todo' option not found on project — skipping status set")
        return False
    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }
    """
    github_graphql(mutation, {
        "projectId": project_id,
        "itemId": item_id,
        "fieldId": field_id,
        "optionId": option_id,
    })
    return True


# ── Main ───────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"=== PR Triage: #{PR_NUMBER} ===")

    pr_data = fetch_pr(PR_NUMBER)
    pr_node_id = pr_data["node_id"]
    pr_title = pr_data.get("title") or ""
    pr_body = pr_data.get("body") or ""
    print(f"Title:  {pr_title}")
    print(f"Author: @{PR_AUTHOR}")

    is_org_member = PR_AUTHOR in ORG_MEMBERS
    category = DEFAULT_CATEGORY

    if is_org_member:
        print(f"@{PR_AUTHOR} is an org member — defaulting category to Dev")
    else:
        print("External contributor — asking LLM for category")
        try:
            files = fetch_pr_files(PR_NUMBER)
            print(f"Changed files: {len(files)}")
            llm_result = triage_llm(pr_title, pr_body, files)
            print(f"LLM response: {json.dumps(llm_result)}")
            raw_category = llm_result.get("category", DEFAULT_CATEGORY)
            if raw_category in CATEGORIES:
                category = raw_category
            else:
                print(f"[warn] Unknown category '{raw_category}', defaulting to {DEFAULT_CATEGORY}")
        except Exception as exc:
            print(f"[error] LLM call failed: {exc}")
            print(f"Falling back to default category '{DEFAULT_CATEGORY}'")

    print(f"Category: {category}")

    # Resolve project
    project = PROJECTS.get(category) or PROJECTS[DEFAULT_CATEGORY]

    # Add to project board + set Status=Todo so we don't rely on
    # github-project-automation[bot] for the initial status.
    print(f"Adding PR to '{category}' project ({project['id']})...")
    item_id = None
    try:
        item_id = add_to_project(project["id"], pr_node_id)
        print(f"Project item ID: {item_id}")
    except Exception as exc:
        print(f"[error] Failed to add to project: {exc}")

    if item_id:
        try:
            if set_status_todo(project["id"], item_id):
                print("Status set to 'Todo'")
        except Exception as exc:
            print(f"[warn] Failed to set Status=Todo: {exc}")

    # Apply category label (UPPERCASE)
    cat_label = category.upper()
    print(f"Applying label: [{cat_label}]")
    try:
        ensure_label(REPO, cat_label, LABEL_COLORS.get(cat_label, "ededed"), f"Category: {category}")
        add_labels(REPO, PR_NUMBER, [cat_label])
    except Exception as exc:
        print(f"[warn] Label application failed: {exc}")

    print("=== PR triage complete ===")


if __name__ == "__main__":
    main()
