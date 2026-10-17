#!/usr/bin/env python3
"""
apply_refactor.py — Deterministic bulk find/replace across files.

Reads a JSON plan from stdin and applies replacements atomically. Used
by the agent workflows (issue-auto-fix.yml, pr-review-request.yml) to
execute mechanical refactors (theme swaps, renames, constant migrations)
without routing each edit through an LLM — one shell call instead of N
Read+Edit roundtrips.

Input JSON (on stdin):
    {
      "replacements": [
        {"find": "#a3e635", "replace": "#a78bfa"},
        {"find": "#86efac", "replace": "#c4b5fd"}
      ],
      "scope":   ["app/", "src/", "theme.js"],          // files or dirs; default: "."
      "include": "*.{ts,tsx,js,jsx,css,json,md,html}",   // basename glob; default: all
      "regex":   false                                   // `find` as regex if true; default false
    }

Output (stdout): a short summary of files touched and per-file replacement counts.

Exit codes:
  0 — at least one replacement was made
  2 — input / plan error (bad JSON, missing keys, bad regex)
  3 — plan was valid but matched zero files (catches typos early)

Usage from an agent workflow:

    cat <<'PLAN' | python .github/scripts/apply_refactor.py
    {
      "replacements": [
        {"find": "#a3e635", "replace": "#a78bfa"}
      ],
      "scope": ["app/", "src/"]
    }
    PLAN
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

# Dirs we never descend into — saves walk time AND prevents accidentally
# rewriting vendored / generated code.
SKIP_DIRS: set[str] = {
    ".git",
    "node_modules",
    ".wrangler",
    ".next",
    ".turbo",
    ".claude-pr",
    ".elixpo-context",
    "dist",
    "build",
    "coverage",
    ".nyc_output",
    ".parcel-cache",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
}

# File suffixes we skip regardless of include glob — typically lockfiles,
# minified bundles, and tsbuild metadata.
SKIP_FILE_SUFFIXES: tuple[str, ...] = (
    ".lock",
    ".lockb",
    ".min.js",
    ".min.css",
    ".tsbuildinfo",
    ".map",
)

# Bytes we read to sniff whether a file is binary.
BINARY_PROBE_BYTES = 8192


def is_binary(path: Path) -> bool:
    """Return True if the file looks binary (NUL byte in first 8KB)."""
    try:
        with path.open("rb") as f:
            chunk = f.read(BINARY_PROBE_BYTES)
    except OSError:
        return True
    return b"\x00" in chunk


def _expand_brace(pattern: str) -> list[str]:
    """Expand a single `{a,b,c}` group in an fnmatch pattern.

    Only supports one brace group; that covers the common `*.{ts,tsx,js}` case
    without pulling in a bigger glob library.
    """
    if "{" not in pattern or "}" not in pattern:
        return [pattern]
    pre, rest = pattern.split("{", 1)
    if "}" not in rest:
        return [pattern]
    alts, post = rest.split("}", 1)
    return [f"{pre}{a}{post}" for a in alts.split(",")]


def matches_include(name: str, pattern: str | None) -> bool:
    if not pattern:
        return True
    return any(fnmatch.fnmatch(name, p) for p in _expand_brace(pattern))


def walk(scope: Iterable[str], include: str | None) -> Iterable[Path]:
    """Yield files under each scope entry, honouring include glob + skip rules."""
    for root in scope:
        p = Path(root)
        if p.is_file():
            if matches_include(p.name, include) and not any(
                p.name.endswith(sfx) for sfx in SKIP_FILE_SUFFIXES
            ):
                yield p
            continue
        if not p.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(p):
            # Prune skip dirs in-place so os.walk doesn't descend into them.
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if any(fn.endswith(sfx) for sfx in SKIP_FILE_SUFFIXES):
                    continue
                if not matches_include(fn, include):
                    continue
                yield Path(dirpath) / fn


def apply_plan(plan: dict) -> int:
    replacements = plan.get("replacements") or []
    if not isinstance(replacements, list) or not replacements:
        print("error: plan is missing a non-empty 'replacements' list", file=sys.stderr)
        return 2

    scope = plan.get("scope") or ["."]
    if not isinstance(scope, list):
        print("error: 'scope' must be a list of paths", file=sys.stderr)
        return 2

    include = plan.get("include")
    if include is not None and not isinstance(include, str):
        print("error: 'include' must be a string (fnmatch glob)", file=sys.stderr)
        return 2

    use_regex = bool(plan.get("regex", False))

    # Pre-compile / validate patterns.
    compiled: list[tuple[re.Pattern[str] | None, str, str]] = []
    for r in replacements:
        if not isinstance(r, dict):
            print(f"error: replacement entry must be an object, got: {r!r}", file=sys.stderr)
            return 2
        find = r.get("find")
        replace = r.get("replace")
        if not isinstance(find, str) or not isinstance(replace, str):
            print(f"error: replacement missing 'find'/'replace' strings: {r!r}", file=sys.stderr)
            return 2
        if find == "":
            print("error: 'find' must be non-empty", file=sys.stderr)
            return 2
        if use_regex:
            try:
                compiled.append((re.compile(find), replace, find))
            except re.error as exc:
                print(f"error: invalid regex {find!r}: {exc}", file=sys.stderr)
                return 2
        else:
            compiled.append((None, replace, find))

    touched: dict[str, int] = {}
    total_subs = 0
    files_scanned = 0

    for path in walk(scope, include):
        files_scanned += 1
        if is_binary(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        original = text
        file_subs = 0
        for pattern, replacement, literal in compiled:
            if pattern is not None:
                text, n = pattern.subn(replacement, text)
            else:
                n = text.count(literal)
                if n:
                    text = text.replace(literal, replacement)
            file_subs += n

        if file_subs and text != original:
            path.write_text(text, encoding="utf-8")
            touched[str(path)] = file_subs
            total_subs += file_subs

    # Summary
    print(f"scanned {files_scanned} files; changed {len(touched)}; {total_subs} replacements")
    for p in sorted(touched):
        print(f"  {p}: {touched[p]}")

    if total_subs == 0:
        print("warning: no matches — check 'find' strings / scope", file=sys.stderr)
        return 3
    return 0


def main() -> int:
    try:
        plan = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON on stdin: {exc}", file=sys.stderr)
        return 2
    if not isinstance(plan, dict):
        print("error: top-level JSON must be an object", file=sys.stderr)
        return 2
    return apply_plan(plan)


if __name__ == "__main__":
    sys.exit(main())
