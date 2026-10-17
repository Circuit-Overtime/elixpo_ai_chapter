"""
pr_fill_description.py — Rewrite the PR body when a whitelisted author has
embedded `@elixpoo fill` in it.

Triggered by pr-description-fill.yml on pull_request: [opened, edited].
Single LLM call against `LLM_MODEL_AGENT`, then PATCH the PR body via REST.
No tracking comments, no CCR, no claude-code-action overhead.

Env vars (from the workflow):
    AGENT_TOKEN       - elixpoo PAT for gh API
    POLLINATIONS_KEY  - pollinations.ai API key
    REPO              - owner/repo
    PR_NUMBER         - the PR number
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ci_config import LLM_MODEL_AGENT  # noqa: E402
from scripts._common import call_llm, github_rest  # noqa: E402

REPO = os.environ["REPO"]
PR_NUMBER = os.environ["PR_NUMBER"]
# Word-bounded @elixpoo (rejects @elixpooo). Accepts any phrasing after it
# — "fill the PR description", "write me a description", "draft this", etc.
# The LLM generates the body either way; we just detect the mention and
# strip it from the final output so the workflow doesn't re-fire on our edit.
TRIGGER_RE = re.compile(r"@elixpoo\b", re.IGNORECASE)
MAX_DIFF_CHARS = 18000

SYSTEM_PROMPT = """\
You are elixpo, a developer on the Elixpo team. Generate a PR description from a diff.

Rules:
- Never say "Claude", "AI", "LLM", "analyzing", "analysis" — write as a teammate.
- Output ONLY the final PR body. No preamble, no "here's the PR body:" line.
- Use EXACTLY these sections in this order:
  1. `## Changes Made` — 3-7 bullets. Each bullet references a file in backticks and says what changed and why. Skip lockfiles, generated files, formatting-only noise.
  2. `## Checklist` — only include items that actually apply to this diff:
     - `- [ ] \\`export const runtime = 'edge'\\` on any new API route` (only if new route.ts added)
     - `- [ ] No Node built-ins imported (crypto, fs, path, stream, Buffer)` (only if src/ changed)
     - `- [ ] New DB columns/tables have a migration in \\`src/workers/migrations/\\`` (only if D1 schema changed)
     - `- [ ] Rate-limit middleware on new public auth endpoints` (only if new app/api/auth/** route added)
     - `- [ ] \\`./biome.sh ci\\` clean` (always)
     - `- [ ] Tested locally: <how>` (always, leave the "how" as a prompt for the author)
  3. If the author left blockquotes (lines starting with `>`) in the original body, preserve them verbatim below Checklist. Skip the `@elixpoo fill` trigger line.
- No marketing language. No "seamlessly", "leverages", "robust". Bullets, not paragraphs. Under 400 words total.
- End with a single `Fixes #<n>` line ONLY if you can identify a linked issue number from the PR title or diff commit messages. Otherwise omit.
"""


def run(cmd: list[str]) -> str:
    """Shell helper: run, return stdout, empty string on non-zero."""
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return res.stdout
    except FileNotFoundError:
        return ""


def fetch_pr() -> dict:
    return github_rest("GET", f"/repos/{REPO}/pulls/{PR_NUMBER}")


def fetch_diff() -> str:
    # Use gh CLI — authenticated by workflow env (AGENT_TOKEN -> GH_TOKEN).
    diff = run(["gh", "pr", "diff", PR_NUMBER, "--repo", REPO])
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n\n[... diff truncated ...]"
    return diff


def extract_blockquotes(body: str) -> str:
    """Pull out `> ...` lines, skipping the @elixpoo fill trigger line."""
    kept = []
    for line in body.splitlines():
        stripped = line.lstrip()
        if not stripped.startswith(">"):
            continue
        if TRIGGER_RE.search(line):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def main() -> int:
    pr = fetch_pr()
    title = pr.get("title", "")
    body = pr.get("body") or ""

    if not TRIGGER_RE.search(body):
        print(f"PR #{PR_NUMBER} body has no '@elixpoo fill' trigger — nothing to do.")
        return 0

    author_blockquotes = extract_blockquotes(body)
    diff = fetch_diff()
    if not diff.strip():
        print("Empty diff — cannot generate a description. Leaving body as-is.")
        return 0

    user_msg = (
        f"PR #{PR_NUMBER} — {title}\n\n"
        f"Author's blockquotes to preserve verbatim (may be empty):\n"
        f"{author_blockquotes or '(none)'}\n\n"
        f"---\nDiff:\n{diff}"
    )

    print(f"Calling {LLM_MODEL_AGENT} to draft PR description...")
    new_body = call_llm(LLM_MODEL_AGENT, SYSTEM_PROMPT, user_msg).strip()

    # Safety: the LLM must not reintroduce the trigger, else we loop on edit.
    if TRIGGER_RE.search(new_body):
        new_body = TRIGGER_RE.sub("", new_body).strip()

    # Strip any accidental code-fence wrapping.
    if new_body.startswith("```") and new_body.endswith("```"):
        new_body = re.sub(r"^```[a-zA-Z]*\n", "", new_body)
        new_body = re.sub(r"\n```$", "", new_body).strip()

    if not new_body:
        print("LLM returned empty body — leaving PR as-is.")
        return 0

    print(f"Patching PR #{PR_NUMBER} body ({len(new_body)} chars)...")
    github_rest("PATCH", f"/repos/{REPO}/pulls/{PR_NUMBER}", {"body": new_body})
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
