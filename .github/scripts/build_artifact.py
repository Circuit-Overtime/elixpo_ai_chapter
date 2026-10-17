#!/usr/bin/env python3
"""build_artifact.py — builds .elixpo-context/context.md for AI CI grounding."""
import os, sys, time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_config import *  # noqa
from _common import github_rest

REPO = os.environ.get("REPO") or globals().get("REPO", "")
SKIP = {"node_modules", ".git", ".next", "dist", "build", ".venv", "__pycache__", ".wrangler", ".vercel"}
PR_FILES_LIMIT, PR_FILES_PER_PR, CHANGELOG_MAX_LINES = 8, 6, 60
ROOT = Path.cwd()


def log(msg):
    print(f"[build_artifact] {msg}", flush=True)


def safe(fn, fallback, label):
    try:
        return fn()
    except Exception as e:
        log(f"{label} failed: {e}")
        return fallback


def skipped(name):
    return name in SKIP or (name.startswith(".") and name != ".github")


def pr_files(num):
    files = github_rest("GET", f"/repos/{REPO}/pulls/{num}/files?per_page={PR_FILES_PER_PR}")
    return [f["filename"] for f in files if isinstance(f, dict) and f.get("filename")] if isinstance(files, list) else []


def recent_prs():
    if not REPO:
        return "_(REPO env var not set)_"
    data = github_rest("GET", f"/repos/{REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=30")
    merged = [pr for pr in data if pr.get("merged_at")][:20] if isinstance(data, list) else []
    if not merged:
        return "_No merged PRs found._"
    lines = []
    for i, pr in enumerate(merged):
        line = (f"- PR #{pr.get('number', '?')}: {(pr.get('title') or '').strip()} "
                f"(merged {(pr.get('merged_at') or '')[:10] or 'unknown'} by @{(pr.get('user') or {}).get('login', 'unknown')})")
        if i < PR_FILES_LIMIT:
            changed = safe(lambda n=pr.get("number"): pr_files(n), [], f"pr_files({pr.get('number')})")
            if changed:
                line += f" — files: {', '.join(changed)}"
        lines.append(line)
    return "\n".join(lines)


def changelog():
    p = ROOT / "CHANGELOG.md"
    if not p.is_file():
        return "_No CHANGELOG.md found._"
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()[:CHANGELOG_MAX_LINES]
    return "```\n" + "\n".join(lines) + "\n```" if lines else "_CHANGELOG.md is empty._"


def tree(path=ROOT, depth=1):
    if depth > 2:
        return []
    try:
        entries = sorted((e for e in path.iterdir() if not skipped(e.name)), key=lambda e: (e.is_file(), e.name))
    except OSError:
        return []
    lines = []
    for i, e in enumerate(entries):
        conn = "└── " if i == len(entries) - 1 else "├── "
        lines.append(f"{conn}{e.name}{'/' if e.is_dir() else ''}")
        if e.is_dir():
            sub = tree(e, depth + 1)
            ext = "    " if i == len(entries) - 1 else "│   "
            lines.extend(ext + l for l in sub)
    return lines


def recent_files(days=30, limit=40):
    cutoff = time.time() - days * 86400
    found = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if not skipped(d)]
        for f in fn:
            if skipped(f):
                continue
            fp = os.path.join(dp, f)
            try:
                mt = os.stat(fp).st_mtime
            except OSError:
                continue
            if mt >= cutoff:
                found.append((mt, os.path.relpath(fp, ROOT)))
    found.sort(reverse=True)
    return "\n".join(f"- {r}" for _, r in found[:limit]) or "_No files modified in the last 30 days._"


def doc(path, title, max_lines=80):
    if not path.is_file():
        return None
    snippet = "\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[:max_lines])
    return f"### {title}\n\n{snippet}\n"


def main():
    name = globals().get("PROJECT_NAME", REPO or "repo")
    desc = globals().get("PROJECT_DESCRIPTION", "")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    log(f"Building context for {name} ({REPO})")

    prs = safe(recent_prs, "_(error fetching recent PRs)_", "recent_prs")
    tree_lines = safe(tree, [], "tree")
    tree_md = "```\n" + "\n".join(tree_lines) + "\n```" if tree_lines else "_(empty)_"
    files_md = safe(recent_files, "_(error scanning recent files)_", "recent_files")
    changelog_md = safe(changelog, "_(error reading changelog)_", "changelog")
    # AGENTS.md is the real operating manual; embedded so AI CI steps see it
    # without an extra read (README.md is on disk if needed instead).
    agents_md = safe(lambda: doc(ROOT / "AGENTS.md", "AGENTS.md (operating manual excerpt)", 120), None, "agents_doc") or "_No AGENTS.md found._"

    md = (
        f"# {name} — Repo Context\n> Auto-generated on {now}. Used by CI to give AI better context.\n\n"
        f"## Description\n{desc}\n\n"
        f"## Recent Activity (Last 20 Merged PRs)\n{prs}\n\n"
        f"## Recent Changelog Entries\n{changelog_md}\n\n"
        f"## Top-Level Structure\n{tree_md}\n\n"
        f"## Recently Modified Files (Last 30 Days)\n{files_md}\n\n"
        f"## Operating Manual\n{agents_md}\n"
    )

    out = ROOT / ".elixpo-context" / "context.md"
    out.parent.mkdir(exist_ok=True)
    try:
        out.write_text(md, encoding="utf-8")
    except OSError as e:
        log(f"FATAL: could not write {out}: {e}")
        sys.exit(1)
    print(out)


if __name__ == "__main__":
    main()
