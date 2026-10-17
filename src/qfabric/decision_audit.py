from __future__ import annotations

import json
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .decision_campaign import REQUIRED_CLASSIFICATIONS, run_decision_campaign
from .decision_history import DecisionStore
from .decision_records import replay_decision
from .explanations import (
    explain_decision,
    explanation_evidence_lines,
    render_explanation,
)


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _payload(record: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "schema_version",
        "decision_id",
        "kind",
        "task",
        "policy",
        "input",
        "outcome",
        "facts",
    )
    return {
        key: record[key]
        for key in fields
    }


def _summary_payload(report: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in report.items() if key != "store"}


def audit_stage8(
    store_path: Path,
    campaign_path: Path,
    recommendation_input: dict[str, Any],
    rollback_hardware_report: dict[str, Any],
) -> dict[str, object]:
    failures: list[str] = []
    records = DecisionStore(store_path).load()
    persisted_campaign = _load_json(campaign_path)

    with tempfile.TemporaryDirectory() as directory:
        expected_store = Path(directory) / "decisions.jsonl"
        expected_campaign = run_decision_campaign(
            expected_store,
            recommendation_input,
            rollback_hardware_report,
        )
        expected_records = DecisionStore(expected_store).load()

    if [_payload(record) for record in records] != [
        _payload(record) for record in expected_records
    ]:
        failures.append("decision payloads do not match regenerated source evidence")
    if _summary_payload(persisted_campaign) != _summary_payload(expected_campaign):
        failures.append("campaign report does not match regenerated evidence")
    if persisted_campaign.get("store") != str(store_path):
        failures.append("campaign report identifies a different decision store")

    replays = [replay_decision(record) for record in records]
    if not all(item["matches"] for item in replays):
        failures.append("one or more persisted decisions failed exact replay")
    if any(record["policy"]["version"] != 1 for record in records):
        failures.append("decision history contains an unsupported policy version")

    explanations = [explain_decision(record) for record in records]
    format_equivalent = True
    for record, explanation in zip(records, explanations, strict=True):
        rendered = render_explanation(explanation)
        rendered_evidence = rendered.split("Decision evidence\n", maxsplit=1)[1].splitlines()
        same_facts = (
            explanation["input"] == record["input"]
            and explanation["outcome"] == record["outcome"]
            and explanation["facts"] == record["facts"]
        )
        if not same_facts or rendered_evidence != explanation_evidence_lines(explanation):
            format_equivalent = False
    if not format_equivalent:
        failures.append("human and machine explanation facts differ")

    classifications = {
        classification
        for record in records
        for classification in record["facts"]["decision"]["classifications"]
    }
    missing = sorted(REQUIRED_CLASSIFICATIONS - classifications)
    if missing:
        failures.append("missing explanation classifications: " + ", ".join(missing))

    decision_ids = [record["decision_id"] for record in records]
    contiguous = decision_ids == list(range(1, len(records) + 1))
    if not contiguous:
        failures.append("decision identifiers are not contiguous")

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 8,
        "status": "pass" if not failures else "fail",
        "sources": {
            "store": str(store_path),
            "campaign": str(campaign_path),
        },
        "record_count": len(records),
        "recommendation_records": sum(
            record["kind"] == "recommendation" for record in records
        ),
        "recovery_records": sum(record["kind"] == "recovery" for record in records),
        "classifications": sorted(classifications),
        "required_classifications": sorted(REQUIRED_CLASSIFICATIONS),
        "checks": {
            "hash_chain_valid": True,
            "contiguous_stable_ids": contiguous,
            "payloads_match_sources": not any(
                "payloads" in failure for failure in failures
            ),
            "campaign_reproducible": not any(
                "campaign report" in failure for failure in failures
            ),
            "all_replays_exact": all(item["matches"] for item in replays),
            "human_machine_fact_equivalence": format_equivalent,
            "complete_classification_coverage": not missing,
        },
        "failures": failures,
    }


def write_stage8_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
