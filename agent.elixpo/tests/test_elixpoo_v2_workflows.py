from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CALLERS = (
    "elixpoo-triage.yml",
    "elixpoo-mentions.yml",
    "elixpoo-review.yml",
    "elixpoo-merge-memory.yml",
)
REUSABLES = (
    "elixpoo-triage-reusable.yml",
    "elixpoo-mention-reusable.yml",
    "elixpoo-review-reusable.yml",
    "elixpoo-merge-memory-reusable.yml",
)


def test_callers_are_pinned_minimal_and_never_use_pull_request_target() -> None:
    for name in CALLERS:
        text = (ROOT / "distribution/workflows" / name).read_text()
        assert "uses: elixpo/agent.elixpo/.github/workflows/" in text
        assert "@v2" in text
        assert "permissions: {}" in text
        assert "pull_request_target" not in text
        assert "actions/checkout" not in text


def test_reusable_workflows_use_workflow_call_and_bounded_permissions() -> None:
    for name in REUSABLES:
        text = (ROOT / ".github/workflows" / name).read_text()
        assert "workflow_call:" in text
        assert "pull_request_target" not in text
        assert "contents: write" not in text


def test_no_active_legacy_workflow_executes_coding_squads() -> None:
    forbidden = (
        "python -m agents.solve",
        "python -m agents.submit",
        "python -m agents.vet",
        "python -m agents.pick",
        "python -m agents.admission",
        "python -m agents.steward.fix",
    )
    for path in (ROOT / ".github/workflows").glob("*.yml"):
        text = path.read_text()
        assert not any(command in text for command in forbidden), path


def test_workflow_yaml_is_parseable() -> None:
    for folder in (ROOT / ".github/workflows", ROOT / "distribution/workflows"):
        for path in folder.glob("*.yml"):
            assert isinstance(yaml.safe_load(path.read_text()), dict), path
