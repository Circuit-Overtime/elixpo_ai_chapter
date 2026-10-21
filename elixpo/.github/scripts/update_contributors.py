"""
update_contributors.py - Refresh the contributor roster artifact as @elixpoo.

Fetches the contributor list from the source repository (default:
elixpo/elixpo_chapter) via the GitHub REST API, then commits the result to
this site repo at src/data/contributors.json. The committed file is served
raw from main (raw.githubusercontent.com/<repo>/main/src/data/contributors.json)
and read live by the homepage Contributors section, with the bundled copy as a
build-time fallback.

Environment:
    AGENT_TOKEN          GitHub token for @elixpoo (secret: ELIXPOO_GITHUB_AGENTIC_TOKEN)
    TARGET_REPO          Repo to commit into          (default: github.repository)
    CONTRIB_SOURCE_REPO  Repo to read contributors from (default: elixpo/elixpo_chapter)
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scripts._common import github_rest  # noqa: E402

TARGET_REPO = os.environ.get("TARGET_REPO", os.environ.get("REPO", "elixpo/elixpo")).strip()
SOURCE_REPO = os.environ.get("CONTRIB_SOURCE_REPO", "elixpo/elixpo_chapter").strip()
ARTIFACT_PATH = "src/data/contributors.json"
FOUNDER = "Circuit-Overtime"

DEFAULT_HEADLINE = "Our Contributors"
DEFAULT_SUBHEADLINE = (
    "A global community of developers building the future of open-source AI tools."
)


def fetch_contributors(repo: str) -> list[str]:
    """Return contributor logins for `repo`, most-active first, bots removed."""
    logins: list[str] = []
    page = 1
    while True:
        path = f"/repos/{repo}/contributors?per_page=100&page={page}&anon=0"
        batch = github_rest("GET", path)
        if not isinstance(batch, list) or not batch:
            break
        for c in batch:
            login = (c or {}).get("login")
            ctype = (c or {}).get("type", "User")
            if not login:
                continue
            if ctype == "Bot" or login.endswith("[bot]"):
                continue
            logins.append(login)
        if len(batch) < 100:
            break
        page += 1
    return logins


def order_logins(logins: list[str]) -> list[str]:
    """De-dupe (case-insensitive) and force the founder to the front."""
    seen: set[str] = set()
    ordered: list[str] = []
    for login in logins:
        key = login.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(login)

    founder = next((l for l in ordered if l.lower() == FOUNDER.lower()), None)
    if founder:
        ordered.remove(founder)
        ordered.insert(0, founder)
    else:
        ordered.insert(0, FOUNDER)
    return ordered


def get_existing(repo: str, path: str) -> tuple[dict, str | None]:
    """Return (parsed_json, sha) for the existing artifact, or ({}, None)."""
    try:
        resp = github_rest("GET", f"/repos/{repo}/contents/{path}?ref=main")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {}, None
        raise
    if not isinstance(resp, dict) or "content" not in resp:
        return {}, None
    try:
        decoded = base64.b64decode(resp["content"]).decode()
        return json.loads(decoded), resp.get("sha")
    except Exception:
        return {}, resp.get("sha")


def main() -> int:
    if not TARGET_REPO or not SOURCE_REPO:
        print("[error] TARGET_REPO and CONTRIB_SOURCE_REPO must be set", file=sys.stderr)
        return 1

    print(f"Fetching contributors from {SOURCE_REPO} …")
    logins = order_logins(fetch_contributors(SOURCE_REPO))
    print(f"  → {len(logins)} contributors after filtering")
    if len(logins) <= 1:
        print("[error] refusing to write an empty/near-empty roster", file=sys.stderr)
        return 1

    existing, sha = get_existing(TARGET_REPO, ARTIFACT_PATH)
    payload = {
        "headline": existing.get("headline", DEFAULT_HEADLINE),
        "subheadline": existing.get("subheadline", DEFAULT_SUBHEADLINE),
        "source": SOURCE_REPO,
        "contributors": logins,
    }
    new_content = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    # Skip the commit when nothing meaningful changed (ignore key order).
    if existing.get("contributors") == logins and existing.get("source") == SOURCE_REPO:
        print("No contributor changes - skipping commit.")
        return 0

    body = {
        "message": "chore(contributors): refresh roster from "
        f"{SOURCE_REPO} [skip ci]",
        "content": base64.b64encode(new_content.encode()).decode(),
        "branch": "main",
        "committer": {"name": "elixpoo", "email": "elixpoo@users.noreply.github.com"},
        "author": {"name": "elixpoo", "email": "elixpoo@users.noreply.github.com"},
    }
    if sha:
        body["sha"] = sha

    github_rest("PUT", f"/repos/{TARGET_REPO}/contents/{ARTIFACT_PATH}", body)
    print(f"Committed {ARTIFACT_PATH} to {TARGET_REPO} as @elixpoo "
          f"({len(logins)} contributors).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
