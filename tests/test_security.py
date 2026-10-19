from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from agents.elixpoo_v2.core import sanitize_evidence


def _audit_module():
    path = Path(".github/scripts/audit_tokens.py")
    spec = importlib.util.spec_from_file_location("audit_tokens", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_restricted_tokens_are_confined_to_approved_workflows():
    assert _audit_module().audit(Path.cwd()) == []


def test_prompt_injection_fixtures_remain_bounded_untrusted_data():
    fixtures = json.loads(Path("tests/fixtures/prompt_injection.json").read_text())
    evidence = "\n".join(item["text"] for item in fixtures)
    sanitized = sanitize_evidence(evidence)

    assert len(sanitized) <= 24_000
    assert "[untrusted instruction removed]" in sanitized
    assert {item["source"] for item in fixtures} == {
        "issue",
        "comment",
        "repository_instruction",
        "command_output",
        "dependency_metadata",
    }
