#!/usr/bin/env python3
"""
build_artifact.py — Builds a repo context artifact for AI-powered CI.

Runs on a GitHub Actions runner after a PR is merged. Produces
`.elixpo-context/context.md` — a concise Markdown snapshot of the repo
(description, recent PRs, top-level structure, recently modified files,
and key docs) that downstream AI CI steps attach to LLM prompts for
grounding.

Inputs (env): AGENT_TOKEN, REPO
Output: .elixpo-context/context.md  (prints absolute path on success)
"""

import os
import sys
import time
from datetime import datetime, timezone

# ── Config import ──────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *  # noqa: F401, F403
from _common import github_rest

# ── Environment ────────────────────────────────────────
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
REPO = os.environ.get("REPO") or globals().get("REPO", "")

# Directories we never descend into or list.
SKIP_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".venv",
    "__pycache__",
    ".wrangler",
    ".vercel",
}

# Output locations.
REPO_ROOT = os.getcwd()
OUT_DIR = os.path.join(REPO_ROOT, ".elixpo-context")
OUT_FILE = os.path.join(OUT_DIR, "context.md")


# ── Helpers ────────────────────────────────────────────
def log(msg):
    print(f"[build_artifact] {msg}", flush=True)


def is_skipped(name):
    """True for hidden entries and common build/vendor dirs."""
    if name in SKIP_DIRS:
        return True
    if name.startswith(".") and name not in {".github"}:
        return True
    return False


# ── Section builders ───────────────────────────────────
def section_recent_prs():
    """Last 20 merged PRs as Markdown bullets. Returns string."""
    if not REPO:
        return "_(REPO env var not set — skipping PR fetch)_"
    try:
        data = github_rest(
            "GET",
            f"/repos/{REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=30",
        )
    except Exception as e:
        log(f"GitHub API error: {e}")
        return "_(Could not fetch merged PRs from GitHub API.)_"
    if not isinstance(data, list):
        return "_(Could not fetch merged PRs from GitHub API.)_"

    merged = [pr for pr in data if pr.get("merged_at")]
    merged = merged[:20]
    if not merged:
        return "_No merged PRs found._"

    lines = []
    for pr in merged:
        num = pr.get("number", "?")
        title = (pr.get("title") or "").strip().replace("\n", " ")
        merged_at = pr.get("merged_at") or ""
        # Keep only YYYY-MM-DD from the ISO timestamp.
        date = merged_at[:10] if merged_at else "unknown"
        user = (pr.get("user") or {}).get("login") or "unknown"
        lines.append(f"- PR #{num}: {title} (merged {date} by @{user})")
    return "\n".join(lines)


def section_tree(root, max_depth=2):
    """Tree-style listing, max_depth levels deep, skipping SKIP_DIRS + hidden."""
    lines = []

    def walk(path, prefix, depth):
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(path))
        except OSError as e:
            log(f"listdir failed for {path}: {e}")
            return
        # Filter out skipped names.
        entries = [e for e in entries if not is_skipped(e)]
        # Dirs first, then files, each alphabetical.
        dirs = [e for e in entries if os.path.isdir(os.path.join(path, e))]
        files = [e for e in entries if not os.path.isdir(os.path.join(path, e))]
        ordered = dirs + files

        for i, name in enumerate(ordered):
            full = os.path.join(path, name)
            is_last = i == len(ordered) - 1
            connector = "└── " if is_last else "├── "
            suffix = "/" if os.path.isdir(full) else ""
            lines.append(f"{prefix}{connector}{name}{suffix}")
            if os.path.isdir(full) and depth < max_depth:
                extension = "    " if is_last else "│   "
                walk(full, prefix + extension, depth + 1)

    walk(root, "", 1)
    if not lines:
        return "_(empty)_"
    return "```\n" + "\n".join(lines) + "\n```"


def section_recent_files(root, days=30, limit=40):
    """Files modified in the last `days` days, newest first, max `limit`."""
    cutoff = time.time() - days * 86400
    found = []  # list of (mtime, relpath)

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped dirs in-place.
        dirnames[:] = [d for d in dirnames if not is_skipped(d)]
        for fname in filenames:
            if is_skipped(fname):
                continue
            full = os.path.join(dirpath, fname)
            try:
                st = os.stat(full)
            except OSError:
                continue
            if st.st_mtime >= cutoff:
                rel = os.path.relpath(full, root)
                found.append((st.st_mtime, rel))

    if not found:
        return "_No files modified in the last 30 days._"

    found.sort(key=lambda x: x[0], reverse=True)
    found = found[:limit]
    return "\n".join(f"- {rel}" for _, rel in found)


def section_doc(path, title, max_lines=80):
    """First `max_lines` of a doc file, wrapped in a Markdown subsection."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError as e:
        log(f"could not read {path}: {e}")
        return None
    snippet = "\n".join(content.splitlines()[:max_lines])
    return f"### {title}\n\n{snippet}\n"


# ── Main ───────────────────────────────────────────────
def main():
    project_name = globals().get("PROJECT_NAME", REPO or "repo")
    project_desc = globals().get("PROJECT_DESCRIPTION", "")

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    log(f"Building context for {project_name} ({REPO})")

    # Gather sections independently so one failure doesn't kill the artifact.
    try:
        recent_prs = section_recent_prs()
    except Exception as e:
        log(f"section_recent_prs failed: {e}")
        recent_prs = "_(error fetching recent PRs)_"

    try:
        tree = section_tree(REPO_ROOT, max_depth=2)
    except Exception as e:
        log(f"section_tree failed: {e}")
        tree = "_(error building tree)_"

    try:
        recent_files = section_recent_files(REPO_ROOT, days=30, limit=40)
    except Exception as e:
        log(f"section_recent_files failed: {e}")
        recent_files = "_(error scanning recent files)_"

    # AGENTS.md holds the real operating manual (architecture, edge-runtime
    # constraints, migrations, common mistakes). We embed it here because it's
    # NOT auto-loaded by claude-code — CLAUDE.md is. CLAUDE.md on this repo
    # just points to AGENTS.md, so duplicating it would be pointless; and
    # README.md is on disk if the agent needs it.
    #
    # Embedding AGENTS.md lets the model see conventions on session-start
    # without an extra Read roundtrip.
    agents_snippet = None
    try:
        agents_snippet = section_doc(
            os.path.join(REPO_ROOT, "AGENTS.md"),
            "AGENTS.md (operating manual excerpt)",
            max_lines=120,
        )
    except Exception as e:
        log(f"section_doc AGENTS.md failed: {e}")
    agents_block = agents_snippet or "_No AGENTS.md found._"

    md = (
        f"# {project_name} — Repo Context\n"
        f"> Auto-generated on {now_iso}. Used by CI to give AI better context.\n"
        f"\n"
        f"## Description\n"
        f"{project_desc}\n"
        f"\n"
        f"## Recent Activity (Last 20 Merged PRs)\n"
        f"{recent_prs}\n"
        f"\n"
        f"## Top-Level Structure\n"
        f"{tree}\n"
        f"\n"
        f"## Recently Modified Files (Last 30 Days)\n"
        f"{recent_files}\n"
        f"\n"
        f"## Operating Manual\n"
        f"{agents_block}\n"
    )

    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            f.write(md)
    except OSError as e:
        log(f"FATAL: could not write {OUT_FILE}: {e}")
        sys.exit(1)

    print(OUT_FILE)


if __name__ == "__main__":
    main()
