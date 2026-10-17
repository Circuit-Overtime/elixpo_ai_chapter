#!/usr/bin/env python3
"""Check Cloudflare Pages workflows against the Elixpo deployment shape."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

WORKFLOW_PATH = Path(".github/workflows/deploy-cloudflare-pages.yml")
REQUIRED_SNIPPETS = (
    "name: Deploy Cloudflare Pages",
    "contents: read",
    "deployments: write",
    "concurrency:",
    "timeout-minutes:",
    "name: Validate and deploy",
    "npm run registry:sync",
    "npm run registry:check",
)
ORDERED_STEPS = (
    "Ensure Cloudflare Pages project exists",
    "Deploy candidate to Cloudflare Pages",
    "Smoke-test candidate",
    "Attach production custom domain",
    "Verify production hostname after promotion",
)
PINNED_ACTION = re.compile(
    r"^\s*uses:\s*[^\s@]+@([0-9a-f]{40})(?:\s+#.*)?$", re.MULTILINE
)
ANY_ACTION = re.compile(r"^\s*uses:\s*([^\s]+)(?:\s+#.*)?$", re.MULTILINE)


def check_repository(repository: Path) -> list[str]:
    workflow = repository / WORKFLOW_PATH
    if not workflow.is_file():
        return [f"missing {WORKFLOW_PATH}"]

    source = workflow.read_text(encoding="utf-8")
    findings = [
        f"missing required contract: {item}"
        for item in REQUIRED_SNIPPETS
        if item not in source
    ]

    if re.search(r"^\s*pull_request(?:_target)?:", source, re.MULTILINE):
        findings.append("privileged deployment must not run on pull_request events")

    cursor = -1
    for step in ORDERED_STEPS:
        position = source.find(step, cursor + 1)
        if position < 0:
            findings.append(f"missing ordered deployment stage: {step}")
        elif position < cursor:
            findings.append(f"deployment stage is out of order: {step}")
        else:
            cursor = position

    pinned = PINNED_ACTION.findall(source)
    actions = ANY_ACTION.findall(source)
    if len(pinned) != len(actions):
        for action in actions:
            reference = action.rsplit("@", 1)[-1]
            if not re.fullmatch(r"[0-9a-f]{40}", reference):
                findings.append(f"third-party action is not pinned to a commit SHA: {action}")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repositories", nargs="+", type=Path)
    args = parser.parse_args()

    failed = False
    for repository in args.repositories:
        findings = check_repository(repository.resolve())
        if findings:
            failed = True
            print(f"FAIL {repository}")
            for finding in findings:
                print(f"  - {finding}")
        else:
            print(f"PASS {repository}: Cloudflare Pages deployment contract satisfied")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
