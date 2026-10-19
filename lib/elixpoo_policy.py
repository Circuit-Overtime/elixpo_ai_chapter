"""Shared deterministic product boundaries for every Elixpoo public surface."""

from __future__ import annotations

import re

CODING_REQUEST = re.compile(
    r"\b(fix|solve|implement|build|develop|code|patch|write|change|edit|modify|refactor)\b.{0,50}"
    r"\b(code|source|bug|issue|implementation|file|function|component|workflow)\b|"
    r"\b(open|create|push)\b.{0,30}\b(branch|commit|pull request|pr)\b",
    re.IGNORECASE | re.DOTALL,
)
CODING_REFUSAL_TEXT = (
    "Elixpoo v2 does not implement product code, create solution branches, or open solving pull requests. "
    "I can improve this issue, identify missing evidence or likely owners, and outline a bounded plan for a human "
    "contributor."
)


def is_coding_request_text(text: str) -> bool:
    return bool(CODING_REQUEST.search(text or ""))
