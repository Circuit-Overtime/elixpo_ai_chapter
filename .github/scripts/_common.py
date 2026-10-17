"""
_common.py — Shared helpers for all elixpo CI scripts.

Import pattern:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from ci_config import *
    from scripts._common import github_rest, github_graphql, call_llm

GitHub helpers route repository, Project V2, and agent credentials by purpose.
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Make ci_config importable when this module is imported from a script.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ci_config import LLM_API_URL  # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────
USER_AGENT = "elixpo-ci/1.0"
DEFAULT_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.5  # seconds


# ── Token helpers ─────────────────────────────────────────────────────────
def _agent_token() -> str:
    tok = os.environ.get("AGENT_TOKEN", "").strip()
    if not tok:
        raise RuntimeError("AGENT_TOKEN env var is not set")
    return tok


def _repo_token() -> str:
    """Token for repository REST and repository-scoped GraphQL operations."""
    return os.environ.get("REPO_TOKEN", "").strip() or _agent_token()


def _project_token() -> str:
    """Token for organization Project V2 queries and mutations."""
    return os.environ.get("PROJECT_TOKEN", "").strip() or _agent_token()


def _pollinations_key() -> str:
    return os.environ.get("POLLINATIONS_KEY", "").strip()


# ── Retry wrapper ─────────────────────────────────────────────────────────
def _with_retry(fn, *, label: str = "request"):
    """Retry on 5xx and network errors with exponential backoff + jitter."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except urllib.error.HTTPError as exc:
            # 4xx errors (except 429) are permanent — don't retry.
            if exc.code < 500 and exc.code != 429:
                raise
            last_exc = exc
            body_preview = _read_error_body(exc)[:200]
            print(
                f"[retry] {label} failed with HTTP {exc.code} "
                f"(attempt {attempt}/{MAX_RETRIES}): {body_preview}",
                file=sys.stderr,
            )
        except urllib.error.URLError as exc:
            last_exc = exc
            print(
                f"[retry] {label} network error "
                f"(attempt {attempt}/{MAX_RETRIES}): {exc.reason}",
                file=sys.stderr,
            )
        except Exception as exc:
            # Any other exception — let the caller handle it.
            raise
        if attempt < MAX_RETRIES:
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode(errors="replace")
    except Exception:
        return ""


# ── GitHub REST ───────────────────────────────────────────────────────────
def github_rest(
    method: str,
    path: str,
    body: dict | list | None = None,
    *,
    token: str | None = None,
    accept: str = "application/vnd.github+json",
    raise_on_status: bool = True,
) -> dict | list:
    """Make an authenticated GitHub REST API call.

    `path` starts with `/` (e.g. `/repos/foo/bar/issues/1`).
    Repository calls use REPO_TOKEN unless an explicit token is supplied.
    Returns parsed JSON, or {} for 204 No Content.
    """
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body is not None else None

    def _do():
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {token or _repo_token()}")
        req.add_header("Accept", accept)
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("User-Agent", USER_AGENT)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            raw = resp.read().decode()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"_raw": raw}

    try:
        return _with_retry(_do, label=f"{method} {path}")
    except urllib.error.HTTPError as exc:
        if raise_on_status:
            raise
        return {"_error": exc.code, "_body": _read_error_body(exc)[:500]}


# ── GitHub GraphQL ────────────────────────────────────────────────────────
def github_graphql(
    query: str, variables: dict | None = None, *, token: str | None = None
) -> dict:
    """Make a GraphQL call with PROJECT_TOKEN by default.

    Uses the `variables` parameter so user-controlled values don't need to be
    interpolated into the query string. Repository-scoped mutations must pass
    REPO_TOKEN explicitly.
    """
    payload: dict = {"query": query}
    if variables:
        payload["variables"] = variables

    def _do():
        req = urllib.request.Request(
            "https://api.github.com/graphql",
            data=json.dumps(payload).encode(),
            method="POST",
        )
        req.add_header("Authorization", f"Bearer {token or _project_token()}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", USER_AGENT)
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            return json.loads(resp.read().decode())

    result = _with_retry(_do, label="GraphQL")
    if result.get("errors"):
        raise RuntimeError(f"GraphQL request failed: {result['errors']}")
    return result


def resolve_org_project(owner: str, number: int) -> dict:
    """Resolve a Project V2 board and its single-select metadata at runtime."""
    query = """
    query($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectsV2(first: 50) { nodes { id number title } }
        projectV2(number: $number) {
          id
          fields(first: 50) {
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
    result = github_graphql(query, {"owner": owner, "number": number})
    organization = (result.get("data") or {}).get("organization") or {}
    project = organization.get("projectV2")
    if not project:
        visible = [
            f"#{item.get('number')} {item.get('title')}"
            for item in (organization.get("projectsV2") or {}).get("nodes") or []
            if item
        ]
        raise RuntimeError(
            f"Project V2 {owner}/{number} is unavailable to PROJECT_TOKEN; "
            f"visible organization projects: {', '.join(visible) or 'none'}"
        )

    resolved = {"id": project["id"], "number": number}
    for field in (project.get("fields") or {}).get("nodes") or []:
        if not field or not field.get("name"):
            continue
        key = field["name"].strip().lower()
        resolved[f"{key}_field_id"] = field.get("id")
        resolved[f"{key}_options"] = {
            option["name"]: option["id"]
            for option in field.get("options") or []
            if option.get("name") and option.get("id")
        }
    return resolved


def ensure_project_item(project_id: str, content_id: str) -> str:
    """Return an existing Project V2 item or add it exactly once."""
    query = """
    query($contentId: ID!) {
      node(id: $contentId) {
        ... on Issue {
          projectItems(first: 100) { nodes { id project { id } } }
        }
        ... on PullRequest {
          projectItems(first: 100) { nodes { id project { id } } }
        }
      }
    }
    """
    result = github_graphql(query, {"contentId": content_id})
    node = (result.get("data") or {}).get("node") or {}
    for item in (node.get("projectItems") or {}).get("nodes") or []:
        if item and (item.get("project") or {}).get("id") == project_id:
            return item["id"]

    mutation = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item { id }
      }
    }
    """
    result = github_graphql(
        mutation, {"projectId": project_id, "contentId": content_id}
    )
    try:
        return result["data"]["addProjectV2ItemById"]["item"]["id"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError(f"Failed to add content to Project V2: {result}") from exc


# ── LLM (Pollinations) ────────────────────────────────────────────────────
def call_llm(
    model: str,
    system_prompt: str,
    user_message: str,
    *,
    temperature: float | None = None,
    json_mode: bool = False,
) -> str:
    """Call the Pollinations LLM endpoint and return the raw string response.

    - Sets User-Agent to bypass Cloudflare's default-Python-UA block.
    - Retries on 5xx and network errors.
    - Caller handles JSON parsing if json_mode=True (tolerate code fences).
    """
    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    key = _pollinations_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"

    def _do():
        req = urllib.request.Request(
            LLM_API_URL, data=json.dumps(payload).encode(), method="POST"
        )
        for k, v in headers.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            result = json.loads(resp.read().decode())
        return result["choices"][0]["message"]["content"]

    return _with_retry(_do, label=f"LLM ({model})")


def parse_llm_json(content: str) -> dict:
    """Strip code fences and parse the LLM's JSON response."""
    stripped = content.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fence:
        stripped = fence.group(1)
    return json.loads(stripped)


# ── Label helpers ─────────────────────────────────────────────────────────
def ensure_label(repo: str, name: str, color: str, description: str = "") -> None:
    """Create a label if it doesn't exist."""
    try:
        github_rest("GET", f"/repos/{repo}/labels/{urllib.parse.quote(name, safe='')}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print(f"  Creating label '{name}'")
            github_rest(
                "POST",
                f"/repos/{repo}/labels",
                {"name": name, "color": color, "description": description},
            )
        else:
            raise


def add_labels(repo: str, issue_number: str | int, labels: list[str]) -> None:
    """Add labels to an issue or PR (PRs share the issues endpoint)."""
    github_rest(
        "POST",
        f"/repos/{repo}/issues/{issue_number}/labels",
        {"labels": labels},
    )


# ── Mention detection ─────────────────────────────────────────────────────
MENTION_PATTERN = re.compile(r"(?<![A-Za-z0-9_.+\-])@elixpoo(?![A-Za-z0-9_.+\-])")


def mentions_elixpoo(text: str | None) -> bool:
    """Word-boundary match for @elixpoo. Avoids false positives on
    `@elixpooooo` or `email@elixpoo.com`."""
    if not text:
        return False
    return bool(MENTION_PATTERN.search(text))
