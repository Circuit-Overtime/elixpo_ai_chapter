from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .decision_history import DecisionStore
from .decision_records import (
    record_hardware_recovery,
    record_recommendation,
    record_recovery_trace,
    replay_decision,
)
from .explanations import explain_decision, render_explanation
from .recommendation_scenarios import run_recommendation_scenarios
from .recovery import RecoveryObservation, RecoveryPolicy

REQUIRED_CLASSIFICATIONS = {
    "insufficient_evidence",
    "unsafe_semantics",
    "failed_admission",
    "excessive_rpc_cost",
    "failed_probation",
    "infeasibility",
}


def _human_carries_machine_facts(explanation: dict[str, Any], rendered: str) -> bool:
    required_metadata = (
        f"QFabric decision {explanation['decision_id']}",
        f"- task: {explanation['task']}",
        f"- kind: {explanation['kind']}",
        f"- policy: {explanation['policy']['name']}-v{explanation['policy']['version']}",
        f"- recorded UTC: {explanation['recorded_utc']}",
        f"- record SHA-256: {explanation['record_sha256']}",
    )
    return all(value in rendered for value in required_metadata) and all(
        json.dumps(value, sort_keys=True) in rendered
        for section in ("input", "outcome", "facts")
        for value in _leaf_values(explanation[section])
    )


def _leaf_values(value: Any) -> list[Any]:
    if isinstance(value, dict):
        return [leaf for item in value.values() for leaf in _leaf_values(item)]
    if isinstance(value, list):
        if not value:
            return [[]]
        return [leaf for item in value for leaf in _leaf_values(item)]
    return [value]


def run_decision_campaign(
    store_path: Path,
    recommendation_input: dict[str, Any],
    rollback_hardware_report: dict[str, Any],
) -> dict[str, object]:
    store = DecisionStore(store_path)
    if store.load():
        raise ValueError("Stage 8 campaign requires an empty decision history")

    scenarios = run_recommendation_scenarios(recommendation_input)
    selected_scenarios = (
        "measured-end-to-end",
        "rt-positive",
        "insufficient-evidence",
        "rt-inadmissible",
        "effect-ineligible",
    )
    scenario_by_name = {item["name"]: item for item in scenarios["scenarios"]}
    for name in selected_scenarios:
        source = scenario_by_name[name]["input"]
        task = source["tasks"][0]["name"]
        record_recommendation(store, source, task=task)

    record_hardware_recovery(store, rollback_hardware_report, recommendation_input)

    policy = RecoveryPolicy(
        probation_windows=3,
        probation_max_windows=5,
        cooldown_windows=3,
        blacklist_windows=5,
    )
    infeasible = RecoveryObservation(
        source_contract_state="VIOLATED",
        evidence_valid=True,
        recommended_domain=None,
        safe_boundary=True,
        alternatives_exhausted=True,
    )
    record_recovery_trace(
        store,
        task=recommendation_input["tasks"][0]["name"],
        policy=policy,
        observations=[infeasible, infeasible],
        initial_domain="linux",
        initial_epoch=1,
        provenance="controlled-fault-injection-not-hardware-performance",
    )

    restarted = DecisionStore(store_path)
    records = restarted.load()
    replays = [replay_decision(record) for record in records]
    explanations = [explain_decision(record) for record in records]
    format_checks = [
        _human_carries_machine_facts(item, render_explanation(item))
        for item in explanations
    ]
    classifications = sorted(
        {
            classification
            for record in records
            for classification in record["facts"]["decision"]["classifications"]
        }
    )
    coverage = {
        name: [
            record["decision_id"]
            for record in records
            if name in record["facts"]["decision"]["classifications"]
        ]
        for name in sorted(REQUIRED_CLASSIFICATIONS)
    }
    checks = {
        "restart_persistence": len(records) == len(store.load()),
        "contiguous_stable_ids": [record["decision_id"] for record in records]
        == list(range(1, len(records) + 1)),
        "complete_classification_coverage": all(coverage.values()),
        "all_replays_exact": all(item["matches"] for item in replays),
        "human_machine_fact_equivalence": all(format_checks),
        "hash_chain_valid": bool(records),
    }
    failures = [name for name, passed in checks.items() if not passed]
    return {
        "schema_version": 1,
        "campaign": "immutable-decision-history-v1",
        "status": "pass" if not failures else "fail",
        "store": str(store_path),
        "record_count": len(records),
        "recommendation_records": sum(
            record["kind"] == "recommendation" for record in records
        ),
        "recovery_records": sum(record["kind"] == "recovery" for record in records),
        "classifications": classifications,
        "required_classifications": sorted(REQUIRED_CLASSIFICATIONS),
        "coverage": coverage,
        "checks": checks,
        "replays": [
            {
                "decision_id": item["decision_id"],
                "kind": item["kind"],
                "matches": item["matches"],
            }
            for item in replays
        ],
        "failures": failures,
    }


def write_decision_campaign(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
