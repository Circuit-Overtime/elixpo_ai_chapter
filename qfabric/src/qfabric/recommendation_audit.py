from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .recommendation import recommend
from .recommendation_input import build_recommendation_input, load_operations
from .recommendation_scenarios import run_recommendation_scenarios

REQUIRED_REASON_CODES = {
    "higher_predicted_end_to_end",
    "insufficient_evidence",
    "destination_not_admitted",
    "semantic_ineligible",
    "cooldown_active",
    "mcu_headroom_exceeded",
    "contract_not_satisfied",
    "observed_miss_rate_exceeds_contract",
    "predicted_deadline_miss",
}


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _candidate(record: dict[str, Any], domain: str) -> dict[str, Any]:
    return next(candidate for candidate in record["candidates"] if candidate["domain"] == domain)


def audit_stage6(
    root: Path,
    stage5_root: Path,
    abi_path: Path,
    operations_path: Path,
) -> dict[str, object]:
    failures: list[str] = []
    operations = load_operations(operations_path)
    persisted_input = _load_json(root / "recommendation-input.json")
    rebuilt_input = build_recommendation_input(stage5_root, abi_path, operations)
    if persisted_input != rebuilt_input:
        failures.append("recommendation input does not match its Stage 5 and ABI sources")

    persisted_all = _load_json(root / "recommendations.json")
    recomputed_all = recommend(rebuilt_input)
    if persisted_all != recomputed_all:
        failures.append("complete recommendation report is not deterministic")

    task_name = rebuilt_input["tasks"][0]["name"]
    persisted_filtered = _load_json(root / "filtered-recommendation.json")
    recomputed_filtered = recommend(rebuilt_input, task_filter=task_name)
    if persisted_filtered != recomputed_filtered:
        failures.append("filtered recommendation report is not deterministic")
    if recomputed_filtered != recomputed_all:
        failures.append("single-task filtered and complete recommendations differ")

    persisted_scenarios = _load_json(root / "recommendation-scenarios.json")
    recomputed_scenarios = run_recommendation_scenarios(rebuilt_input)
    if persisted_scenarios != recomputed_scenarios:
        failures.append("recommendation scenario report is not deterministic")
    if recomputed_scenarios["status"] != "pass":
        failures.append("recommendation scenario suite failed")

    record = recomputed_all["records"][0]
    linux = _candidate(record, "linux")
    rt = _candidate(record, "rt")
    measured_choice_passed = (
        record["recommended_domain"] == "linux"
        and rt["local_execution_p95_ns"] < linux["local_execution_p95_ns"]
        and rt["predicted_end_to_end_ns"] > linux["predicted_end_to_end_ns"]
        and "higher_predicted_end_to_end"
        in {reason["code"] for reason in rt["rejection_reasons"]}
    )
    if not measured_choice_passed:
        failures.append("measured faster-MCU/slower-end-to-end decision is invalid")

    observed_reason_codes = {
        reason["code"]
        for scenario in recomputed_scenarios["scenarios"]
        for candidate in scenario["recommendation"]["records"][0]["candidates"]
        for reason in candidate["rejection_reasons"]
    }
    missing_reason_codes = sorted(REQUIRED_REASON_CODES - observed_reason_codes)
    if missing_reason_codes:
        failures.append(
            "scenario suite lacks rejection reasons: " + ", ".join(missing_reason_codes)
        )

    positive_rt = next(
        scenario
        for scenario in recomputed_scenarios["scenarios"]
        if scenario["name"] == "rt-positive"
    )
    if positive_rt["recommendation"]["records"][0]["recommended_domain"] != "rt":
        failures.append("positive RT scenario did not recommend RT")
    insufficient = next(
        scenario
        for scenario in recomputed_scenarios["scenarios"]
        if scenario["name"] == "insufficient-evidence"
    )
    if insufficient["recommendation"]["records"][0]["status"] != "withheld":
        failures.append("insufficient-evidence scenario was not withheld")

    reports = [recomputed_all, recomputed_filtered] + [
        scenario["recommendation"] for scenario in recomputed_scenarios["scenarios"]
    ]
    advisory_passed = all(
        report["advisory_only"] is True
        and report["placement_changes"] == 0
        and all(record["placement_changed"] is False for record in report["records"])
        for report in reports
    )
    if not advisory_passed:
        failures.append("a Stage 6 report indicates a live placement change")

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 6,
        "status": "pass" if not failures else "fail",
        "sources": {
            "root": str(root),
            "stage5_root": str(stage5_root),
            "abi": str(abi_path),
            "operations": str(operations_path),
        },
        "measured_recommendation": {
            "task": task_name,
            "selected": record["recommended_domain"],
            "linux_end_to_end_p95_ns": linux["end_to_end_p95_ns"],
            "rt_end_to_end_p95_ns": rt["end_to_end_p95_ns"],
            "linux_local_execution_p95_ns": linux["local_execution_p95_ns"],
            "rt_local_execution_p95_ns": rt["local_execution_p95_ns"],
            "rt_projected_mcu_utilization_pct": rt["mcu"]["projected_utilization_pct"],
            "reserved_mcu_headroom_pct": rt["mcu"]["reserved_headroom_pct"],
            "passed": measured_choice_passed,
        },
        "scenario_count": recomputed_scenarios["scenario_count"],
        "rejection_reason_coverage": sorted(observed_reason_codes),
        "required_rejection_reasons": sorted(REQUIRED_REASON_CODES),
        "deterministic": not any("deterministic" in failure for failure in failures),
        "advisory_only": advisory_passed,
        "placement_changes": 0 if advisory_passed else None,
        "failures": failures,
    }


def write_stage6_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
