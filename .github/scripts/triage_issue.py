#!/usr/bin/env python3
"""
Issue Triage Bot — accounts.elixpo
Categorizes and prioritizes new GitHub issues via LLM, then files them
into the matching per-category GitHub Project V2 with labels and a comment.
"""

import json
import os
import sys
import urllib.error

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

# ── Environment variables ──────────────────────────────────────────────────
# Note: ISSUE_TITLE and ISSUE_BODY are intentionally NOT read from env vars.
# The event payload is stale if issue_description.py has already rewritten
# the body in an earlier step. We fetch them fresh from the GitHub API below.
# AGENT_TOKEN is a PAT for the @elixpoo account with full project write scope,
# used for both REST and GraphQL (Project V2) calls.
AGENT_TOKEN = os.environ["AGENT_TOKEN"]
POLLINATIONS_KEY = os.environ.get("POLLINATIONS_KEY", "")
ISSUE_NUMBER = os.environ["ISSUE_NUMBER"]
ISSUE_AUTHOR = os.environ["ISSUE_AUTHOR"]
REPO = os.environ["REPO"]

# ── Defaults ───────────────────────────────────────────────────────────────
DEFAULT_CATEGORY = "Support"
DEFAULT_PRIORITY = "Medium"
DEFAULT_SUMMARY = "Awaiting manual triage"

# ── Label colors (hex, no #) — all labels are UPPERCASE ──────────────────
LABEL_COLORS = {
    "FEATURE": "a2eeef",
    "BUGS": "d73a4a",
    "SUPPORT": "cfd3d7",
    "DEV": "7057ff",
    "URGENT": "b60205",
    "HIGH": "d93f0b",
    "MEDIUM": "fbca04",
    "LOW": "0e8a16",
    "ELIXPO": "0e8a16",
}


# ── LLM call ───────────────────────────────────────────────────────────────
def triage_llm(title: str, body: str, include_category: bool) -> dict:
    """Ask the Pollinations LLM to triage the issue. Returns parsed JSON."""
    if include_category:
        system_prompt = (
            f"You are an issue triage bot for {PROJECT_NAME} ({PROJECT_DESCRIPTION}).\n"
            "Categorize this issue and set priority.\n\n"
            "Categories:\n"
            "- Feature: new capabilities, enhancements, UX improvements\n"
            "- Bugs: errors, crashes, regressions, broken behavior\n"
            "- Support: questions, how-to, help requests\n"
            "- Dev: internal dev work, refactoring, infrastructure\n\n"
            "Priority levels:\n"
            "- Urgent: security issues, data loss, production down\n"
            "- High: crashes, major functional bugs\n"
            "- Medium: minor bugs, standard features, most items (default)\n"
            "- Low: nice-to-have, cosmetic, questions\n\n"
            'Respond in JSON only: {"category": "...", "priority": "...", "summary": "one sentence"}'
        )
    else:
        system_prompt = (
            f"You are an issue triage bot for {PROJECT_NAME} ({PROJECT_DESCRIPTION}).\n"
            "This issue is from an org member — category is already set to Dev.\n"
            "Pick a priority only.\n\n"
            "Priority levels:\n"
            "- Urgent: security issues, data loss, production down\n"
            "- High: crashes, major functional bugs\n"
            "- Medium: minor bugs, standard features, most items (default)\n"
            "- Low: nice-to-have, cosmetic, questions\n\n"
            'Respond in JSON only: {"category": "Dev", "priority": "...", "summary": "one sentence"}'
        )

    user_message = f"Title: {title}\n\nBody: {body}"
    content = call_llm(LLM_MODEL_CHAT, system_prompt, user_message, json_mode=True)
    return parse_llm_json(content)


# ── Issue / Project V2 helpers ─────────────────────────────────────────────
def fetch_issue(issue_number: str) -> dict:
    """Fetch the full issue payload (node_id, title, body) from the REST API.

    This is the freshest source of truth — we use it instead of the event
    payload because an earlier pipeline step may have rewritten the body.
    """
    return github_rest("GET", f"/repos/{REPO}/issues/{issue_number}")


def assign_issue(issue_number: str, assignee: str) -> None:
    """Assign an issue to a user."""
    try:
        github_rest(
            "POST",
            f"/repos/{REPO}/issues/{issue_number}/assignees",
            {"assignees": [assignee]},
        )
        print(f"  Assigned to @{assignee}")
    except urllib.error.HTTPError as exc:
        print(f"[warn] Failed to assign @{assignee}: {exc}")


def add_to_project(project_id: str, issue_node_id: str) -> str:
    """Add an issue to a Project V2 board. Returns the project item ID."""
    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item { id }
      }
    }
    """
    result = github_graphql(
        mutation, {"projectId": project_id, "contentId": issue_node_id}
    )
    try:
        return result["data"]["addProjectV2ItemById"]["item"]["id"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError(f"Failed to add issue to project: {result}") from exc


def find_status_todo(project_id: str) -> tuple[str | None, str | None]:
    """Return (status_field_id, todo_option_id) or (None, None) if absent."""
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


def set_single_select_field(
    project_id: str, item_id: str, field_id: str, option_id: str
) -> None:
    """Set a single-select field value on a project item."""
    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: {singleSelectOptionId: $optionId}
      }) {
        projectV2Item { id }
      }
    }
    """
    github_graphql(
        mutation,
        {
            "projectId": project_id,
            "itemId": item_id,
            "fieldId": field_id,
            "optionId": option_id,
        },
    )


def set_issue_type(issue_node_id: str, issue_type_id: str) -> None:
    """Set the GitHub Issue Type (sidebar 'Type' field) via GraphQL."""
    mutation = """
    mutation($issueId: ID!, $issueTypeId: ID!) {
      updateIssueIssueType(input: {
        issueId: $issueId,
        issueTypeId: $issueTypeId
      }) {
        issue { id }
      }
    }
    """
    github_graphql(
        mutation, {"issueId": issue_node_id, "issueTypeId": issue_type_id}
    )


# ── Main ───────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"=== Issue Triage: #{ISSUE_NUMBER} ===")

    # ── Step 0: Fetch fresh issue data from the API ───────────────────────
    # The event payload may be stale (an earlier step can rewrite the body),
    # so we treat the REST API as the source of truth for title/body.
    print("Fetching fresh issue data from API...")
    issue_data = fetch_issue(ISSUE_NUMBER)
    issue_node_id = issue_data["node_id"]
    issue_title = issue_data.get("title") or ""
    issue_body = issue_data.get("body") or ""
    print(f"Title:  {issue_title}")
    print(f"Author: {ISSUE_AUTHOR}")
    print(f"Node ID: {issue_node_id}")

    is_org_member = ISSUE_AUTHOR in ORG_MEMBERS
    if is_org_member:
        print(f"Author @{ISSUE_AUTHOR} is an org member — forcing category to Dev")
        try:
            assign_issue(ISSUE_NUMBER, ISSUE_AUTHOR)
        except Exception as exc:
            print(f"[warn] Assign failed: {exc}")

    # ── Step 1: LLM triage ────────────────────────────────────────────────
    category = "Dev" if is_org_member else DEFAULT_CATEGORY
    priority = DEFAULT_PRIORITY
    summary = DEFAULT_SUMMARY

    try:
        print("Calling LLM for triage...")
        llm_result = triage_llm(
            issue_title, issue_body, include_category=not is_org_member
        )
        print(f"LLM response: {json.dumps(llm_result)}")

        raw_category = llm_result.get("category", category)
        raw_priority = llm_result.get("priority", DEFAULT_PRIORITY)
        raw_summary = llm_result.get("summary", DEFAULT_SUMMARY)

        if is_org_member:
            category = "Dev"  # Always force Dev for org members
        elif raw_category in CATEGORIES:
            category = raw_category
        else:
            print(
                f"[warn] Unknown category '{raw_category}', defaulting to {DEFAULT_CATEGORY}"
            )
            category = DEFAULT_CATEGORY

        if raw_priority in PRIORITIES:
            priority = raw_priority
        else:
            print(
                f"[warn] Unknown priority '{raw_priority}', defaulting to {DEFAULT_PRIORITY}"
            )
            priority = DEFAULT_PRIORITY

        summary = (raw_summary or DEFAULT_SUMMARY).strip() or DEFAULT_SUMMARY

    except Exception as exc:
        print(f"[error] LLM call failed: {exc}")
        print("Falling back to defaults.")
        # Keep existing defaults; org override already applied above.

    print(f"Triage result => Category: {category} | Priority: {priority}")
    print(f"Summary: {summary}")

    # ── Step 2: Resolve project ───────────────────────────────────────────
    project = PROJECTS.get(category)
    if project is None:
        print(
            f"[warn] No project config for category '{category}', falling back to Support"
        )
        category = "Support"
        project = PROJECTS["Support"]

    # ── Step 2a: Set native GitHub Issue Type (sidebar "Type") ────────────
    type_name = CATEGORY_TO_TYPE.get(category, "Task")
    type_id = ISSUE_TYPES.get(type_name)
    if type_id:
        print(f"Setting issue type to '{type_name}'...")
        try:
            set_issue_type(issue_node_id, type_id)
        except Exception as exc:
            print(f"[warn] Failed to set issue type: {exc}")
    else:
        print(f"[warn] No issue type ID for '{type_name}', skipping")

    priority_option_id = project["priority_options"].get(priority)
    if priority_option_id is None:
        print(
            f"[warn] No option ID for priority '{priority}' in project '{category}', "
            f"defaulting to {DEFAULT_PRIORITY}"
        )
        priority = DEFAULT_PRIORITY
        priority_option_id = project["priority_options"].get(priority)

    # ── Step 3: Add to project ────────────────────────────────────────────
    print(f"Adding issue to '{category}' project ({project['id']})...")
    try:
        item_id = add_to_project(project["id"], issue_node_id)
        print(f"Project item ID: {item_id}")
    except Exception as exc:
        print(f"[error] Failed to add to project: {exc}")
        item_id = None

    # ── Step 4: Set priority field ────────────────────────────────────────
    if item_id and priority_option_id:
        print(f"Setting Priority field to '{priority}'...")
        try:
            set_single_select_field(
                project["id"], item_id, project["priority_field_id"], priority_option_id
            )
        except Exception as exc:
            print(f"[warn] Failed to set priority: {exc}")
    elif not priority_option_id:
        print(f"[warn] No option ID for priority '{priority}', skipping field update")

    # ── Step 4b: Set Status=Todo (replaces github-project-automation[bot]) ─
    if item_id:
        status_field_id, todo_option_id = find_status_todo(project["id"])
        if status_field_id and todo_option_id:
            try:
                set_single_select_field(
                    project["id"], item_id, status_field_id, todo_option_id
                )
                print("Status set to 'Todo'")
            except Exception as exc:
                print(f"[warn] Failed to set Status=Todo: {exc}")
        else:
            print("[warn] Status field or 'Todo' option not found on project — skipping status set")

    # ── Step 5: Apply labels ──────────────────────────────────────────────
    cat_label = category.upper()
    pri_label = priority.upper()
    print(f"Applying labels: [{cat_label}, {pri_label}]")

    try:
        ensure_label(
            REPO, cat_label, LABEL_COLORS.get(cat_label, "ededed"), f"Category: {category}"
        )
        ensure_label(
            REPO, pri_label, LABEL_COLORS.get(pri_label, "ededed"), f"Priority: {priority}"
        )
        add_labels(REPO, ISSUE_NUMBER, [cat_label, pri_label])
    except Exception as exc:
        print(f"[warn] Label application failed: {exc}")

    print("=== Triage complete ===")


if __name__ == "__main__":
    main()
