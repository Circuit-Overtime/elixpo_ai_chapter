"""Legacy community-issue scorer — archived autonomous-contributor design.

Pure and deterministic: it scores a struct of pre-extracted signals, so it's
trivially unit-testable. The fuzzy extraction (does the body have repro steps? a
clear acceptance criterion? did someone say "I'll take this"?) is the triage
squad's job — it fills IssueSignals, then calls score(). Threshold ≥ 8 to queue.
"""

from __future__ import annotations

from math import isfinite

from pydantic import BaseModel, Field

THRESHOLD = 8
MIN_ISSUE_AGE_DAYS = 7
MAX_ISSUE_AGE_DAYS = 60
MAX_ACTIVITY_AGE_DAYS = 30

POSITIVE_LABELS = {"good first issue", "help wanted", "up-for-grabs", "hacktoberfest"}
EASY_COMPLEXITIES = {"trivial", "small"}
MIN_SOLVABILITY_CONFIDENCE = 0.7
MAX_EASY_FILES = 5


def in_issue_age_window(age_days: object) -> bool:
    """Return whether a calendar-day age is inside the inclusive target window."""
    if isinstance(age_days, bool):
        return False
    try:
        age = int(age_days)
    except (TypeError, ValueError):
        return False
    return MIN_ISSUE_AGE_DAYS <= age <= MAX_ISSUE_AGE_DAYS


def is_recently_active(activity_age_days: object) -> bool:
    """Return whether an issue was updated inside the inclusive freshness window."""
    if isinstance(activity_age_days, bool):
        return False
    try:
        age = int(activity_age_days)
    except (TypeError, ValueError):
        return False
    return 0 <= age <= MAX_ACTIVITY_AGE_DAYS


class IssueSignals(BaseModel):
    labels: list[str] = Field(default_factory=list)  # lowercased
    has_repro_steps: bool = False          # paired with a "bug" label
    no_assignee: bool = True
    no_maintainer_claim: bool = True
    has_acceptance_criterion: bool = False
    older_than_7_days: bool = False
    stale_over_365_days: bool = False
    op_is_core_maintainer: bool = False
    someone_claimed_recently: bool = False  # model: conversation shows current ownership
    touches_internal_paths: bool = False
    contributing_discuss_first: bool = False  # CONTRIBUTING says discuss-first AND no discussion exists
    already_resolved: bool = False


class SolvabilityVerdict(BaseModel):
    """Explain whether an issue is safe to send to the implementation squads."""

    easy: bool = False
    complexity: str = "unknown"
    estimated_files: int = 0
    confidence: float = 0.0
    blockers: list[str] = Field(default_factory=list)


def _labels(s: IssueSignals) -> set[str]:
    return {label.lower() for label in s.labels}


def score(s: IssueSignals) -> tuple[int, dict[str, int]]:
    """Return (total, breakdown). Breakdown maps each fired signal → its points."""
    labels = _labels(s)
    b: dict[str, int] = {}

    if labels & POSITIVE_LABELS:
        b["good_first/help_wanted"] = 5
    if s.has_repro_steps:
        b["reproducible_bug"] = 3
    if s.no_assignee:
        b["no_assignee"] = 2
    if s.no_maintainer_claim:
        b["no_maintainer_claim"] = 2
    if s.has_acceptance_criterion:
        b["acceptance_criterion"] = 2
    if s.older_than_7_days:
        b["aged"] = 1
    if s.stale_over_365_days:
        b["stale_issue"] = -5
    # A maintainer-authored issue is only a probable self-note when maintainers
    # have not explicitly invited community work through a positive label.
    if s.op_is_core_maintainer and not labels & POSITIVE_LABELS:
        b["op_is_maintainer"] = -5
    if s.someone_claimed_recently:
        b["already_claimed"] = -10
    if s.touches_internal_paths:
        b["internal_paths"] = -10
    if s.contributing_discuss_first:
        b["discuss_first"] = -5
    if s.already_resolved:
        b["already_resolved"] = -10

    return sum(b.values()), b


def qualifies(s: IssueSignals, threshold: int = THRESHOLD) -> bool:
    total, _ = score(s)
    return total >= threshold


def assess_solvability(signals: IssueSignals, extracted: dict | None = None) -> SolvabilityVerdict:
    """Apply hard, fail-closed gates after fuzzy signals have been extracted."""
    extracted = extracted or {}
    blockers: list[str] = []

    if extracted.get("tractable") is not True:
        blockers.append("not confirmed tractable")

    complexity = str(extracted.get("complexity", "unknown")).casefold()
    if complexity not in EASY_COMPLEXITIES:
        blockers.append(f"complexity is {complexity or 'unknown'}")

    try:
        estimated_files = int(extracted.get("estimated_files", 0))
    except (TypeError, ValueError):
        estimated_files = 0
    if not 1 <= estimated_files <= MAX_EASY_FILES:
        blockers.append(f"estimated file count {estimated_files} is outside 1-{MAX_EASY_FILES}")

    try:
        confidence = float(extracted.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    if not isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        confidence = 0.0
    if confidence < MIN_SOLVABILITY_CONFIDENCE:
        blockers.append(f"solvability confidence {confidence:.2f} is below {MIN_SOLVABILITY_CONFIDENCE:.2f}")

    hard_flags = {
        "needs_maintainer_decision": "needs a maintainer decision",
        "needs_external_access": "needs external access or credentials",
        "needs_specialized_hardware": "needs specialized hardware",
    }
    blockers.extend(reason for field, reason in hard_flags.items() if extracted.get(field) is not False)

    completion_is_clear = signals.has_acceptance_criterion or signals.has_repro_steps
    if not completion_is_clear:
        blockers.append("no acceptance criterion or reproducible bug")
    if not signals.no_assignee or not signals.no_maintainer_claim or signals.someone_claimed_recently:
        blockers.append("issue is already assigned or claimed")
    if signals.touches_internal_paths:
        blockers.append("requires internal or private paths")
    if signals.contributing_discuss_first:
        blockers.append("repository requires discussion before implementation")
    if signals.already_resolved:
        blockers.append("conversation indicates the repository change is already resolved")
    if signals.stale_over_365_days:
        blockers.append("issue has not been updated within 365 days")
    return SolvabilityVerdict(
        easy=not blockers,
        complexity=complexity,
        estimated_files=estimated_files,
        confidence=confidence,
        blockers=blockers,
    )
