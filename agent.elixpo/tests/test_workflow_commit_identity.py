"""Elixpoo v2 workflows never create repository commits."""

from pathlib import Path


def test_v2_callers_have_no_commit_or_push_path():
    root = Path(".github/workflows")
    for name in (
        "elixpoo-triage.yml",
        "elixpoo-mentions.yml",
        "elixpoo-review.yml",
        "elixpoo-merge-memory.yml",
    ):
        workflow = (root / name).read_text(encoding="utf-8")
        assert "contents: write" not in workflow
        assert "git commit" not in workflow
        assert "git push" not in workflow
