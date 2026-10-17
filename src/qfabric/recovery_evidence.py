from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .recovery import RecoveryObservation

EVIDENCE_SCHEMA_VERSION = 1
PERMANENT_ALTERNATIVE_REJECTIONS = {
    "semantic_ineligible",
    "destination_not_admitted",
    "mcu_headroom_exceeded",
    "contract_not_satisfied",
    "observed_miss_rate_exceeds_contract",
    "predicted_deadline_miss",
}
TRANSIENT_OR_NONEXHAUSTIVE_REJECTIONS = {
    "insufficient_evidence",
    "cooldown_active",
    "higher_predicted_end_to_end",
}


def _record(report: dict[str, Any], task: str) -> dict[str, Any]:
    records = [record for record in report.get("records", []) if record.get("task") == task]
    if len(records) != 1:
        raise ValueError(f"expected exactly one recommendation record for {task}")
    return records[0]


def _candidate(record: dict[str, Any], domain: str) -> dict[str, Any]:
    matches = [item for item in record.get("candidates", []) if item.get("domain") == domain]
    if len(matches) != 1:
        raise ValueError(f"expected exactly one recommendation candidate for {domain}")
    return matches[0]


def _reason_codes(candidate: dict[str, Any]) -> set[str]:
    return {reason["code"] for reason in candidate.get("rejection_reasons", [])}


def derive_recovery_evidence(
    source_contract: dict[str, Any],
    recommendation: dict[str, Any],
    *,
    task: str,
    safe_boundary: bool,
    target_contract: dict[str, Any] | None = None,
    protected_contracts_healthy: bool = True,
    transient_misses: int = 0,
) -> dict[str, object]:
    record = _record(recommendation, task)
    current_domain = record.get("current_domain")
    if current_domain not in {"linux", "rt"}:
        raise ValueError("recommendation record has an invalid current domain")
    source_candidate = _candidate(record, current_domain)
    source_state = source_contract.get("state")
    if source_state != source_candidate.get("contract_state"):
        raise ValueError("source contract state does not match the recommendation evidence")
    source_count = source_contract.get("evidence_count")
    if source_count != source_candidate.get("evidence_count"):
        raise ValueError("source evidence count does not match the recommendation evidence")

    evidence_valid = bool(record.get("evidence_gate_passed")) and source_state != "UNKNOWN"
    selected = record.get("recommended_domain")
    destination = selected if selected in {"linux", "rt"} and selected != current_domain else None
    alternate_domain = "rt" if current_domain == "linux" else "linux"
    alternate = _candidate(record, alternate_domain)
    alternate_reasons = _reason_codes(alternate)
    destination_candidate = alternate if destination == alternate_domain else None
    destination_reasons = (
        _reason_codes(destination_candidate) if destination_candidate is not None else set()
    )

    semantic_eligible = (
        destination_candidate is not None and "semantic_ineligible" not in destination_reasons
    )
    admission_allowed = destination_candidate is not None and not destination_reasons.intersection(
        {"destination_not_admitted", "mcu_headroom_exceeded"}
    )
    predicted_feasible = destination_candidate is not None and not destination_reasons.intersection(
        {
            "contract_not_satisfied",
            "observed_miss_rate_exceeds_contract",
            "predicted_deadline_miss",
        }
    )
    exhausted = (
        evidence_valid
        and source_state in {"VIOLATED", "INFEASIBLE"}
        and destination is None
        and bool(alternate_reasons.intersection(PERMANENT_ALTERNATIVE_REJECTIONS))
        and not bool(alternate_reasons.intersection(TRANSIENT_OR_NONEXHAUSTIVE_REJECTIONS))
    )

    target_state = None if target_contract is None else target_contract.get("state")
    observation = RecoveryObservation(
        source_contract_state=source_state,
        evidence_valid=evidence_valid,
        recommended_domain=destination,
        semantic_eligible=semantic_eligible,
        admission_allowed=admission_allowed,
        predicted_feasible=predicted_feasible,
        safe_boundary=safe_boundary,
        target_contract_state=target_state,
        protected_contracts_healthy=protected_contracts_healthy,
        transient_misses=transient_misses,
        alternatives_exhausted=exhausted,
    )
    return {
        "schema_version": EVIDENCE_SCHEMA_VERSION,
        "task": task,
        "current_domain": current_domain,
        "source": {
            "contract_state": source_state,
            "evidence_count": source_count,
            "record_id": record.get("record_id"),
        },
        "destination": {
            "domain": destination,
            "alternate_domain": alternate_domain,
            "alternate_rejection_reasons": sorted(alternate_reasons),
        },
        "observation": asdict(observation),
    }


def load_json_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def write_recovery_evidence(evidence: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
