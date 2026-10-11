from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

RECOMMENDATION_SCHEMA_VERSION = 1
DOMAINS = ("linux", "rt")


def _require_number(value: Any, name: str, *, minimum: float = 0) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < minimum:
        raise ValueError(f"{name} must be a number not less than {minimum}")
    return float(value)


def _validate_document(document: dict[str, Any]) -> None:
    if document.get("schema_version") != RECOMMENDATION_SCHEMA_VERSION:
        raise ValueError("unsupported recommendation input schema version")
    if not isinstance(document.get("policy"), dict):
        raise ValueError("recommendation input is missing policy")
    if not isinstance(document.get("mcu"), dict):
        raise ValueError("recommendation input is missing MCU capacity")
    if not isinstance(document.get("tasks"), list) or not document["tasks"]:
        raise ValueError("recommendation input requires at least one task")
    names = [task.get("name") for task in document["tasks"] if isinstance(task, dict)]
    if len(names) != len(document["tasks"]) or any(not isinstance(name, str) for name in names):
        raise ValueError("every recommendation task requires a name")
    if len(set(names)) != len(names):
        raise ValueError("recommendation task names must be unique")


def _semantic_transition_allowed(task: dict[str, Any], domain: str) -> bool:
    if domain == task["current_domain"]:
        return True
    return task["effect"] == "Q_PURE" or task.get("transition_hooks_declared") is True


def _boundary_cost(task: dict[str, Any], domain: str) -> tuple[int, list[dict[str, Any]]]:
    total = 0
    charged = []
    for edge in task.get("chain_edges", []):
        neighbor_domain = edge.get("neighbor_domain")
        if neighbor_domain not in DOMAINS:
            raise ValueError("chain neighbor_domain must be linux or rt")
        cost = int(_require_number(edge.get("boundary_cost_ns"), "boundary_cost_ns"))
        applies = neighbor_domain != domain
        if applies:
            total += cost
        charged.append(
            {
                "neighbor": edge.get("neighbor", "unknown"),
                "neighbor_domain": neighbor_domain,
                "boundary_cost_ns": cost,
                "charged": applies,
            }
        )
    return total, charged


def _evaluate_candidate(
    task: dict[str, Any],
    domain: str,
    policy: dict[str, Any],
    mcu: dict[str, Any],
) -> dict[str, Any]:
    candidates = task.get("candidates")
    if not isinstance(candidates, dict) or not isinstance(candidates.get(domain), dict):
        raise ValueError(f"task {task['name']} is missing the {domain} candidate")
    candidate = candidates[domain]
    evidence_count = int(_require_number(candidate.get("evidence_count"), "evidence_count"))
    p95_ns = int(_require_number(candidate.get("end_to_end_p95_ns"), "end_to_end_p95_ns"))
    local_p95_ns = int(
        _require_number(candidate.get("local_execution_p95_ns"), "local_execution_p95_ns")
    )
    miss_rate = _require_number(
        candidate.get("observed_miss_rate_pct"), "observed_miss_rate_pct"
    )
    boundary_cost_ns, boundary_edges = _boundary_cost(task, domain)
    predicted_ns = p95_ns + boundary_cost_ns
    deadline_ns = int(
        _require_number(task["contract"].get("deadline_ns"), "deadline_ns", minimum=1)
    )
    maximum_miss_rate = _require_number(
        task["contract"].get("max_miss_rate_pct"), "max_miss_rate_pct"
    )
    minimum_evidence = int(
        _require_number(policy.get("minimum_evidence"), "minimum_evidence", minimum=1)
    )
    reasons: list[dict[str, Any]] = []

    if evidence_count < minimum_evidence:
        reasons.append(
            {
                "code": "insufficient_evidence",
                "observed": evidence_count,
                "required": minimum_evidence,
            }
        )
    if not _semantic_transition_allowed(task, domain):
        reasons.append(
            {
                "code": "semantic_ineligible",
                "effect": task["effect"],
                "transition_hooks_declared": task.get("transition_hooks_declared", False),
            }
        )
    if candidate.get("admission_allowed") is not True:
        reasons.append({"code": "destination_not_admitted"})
    if candidate.get("contract_state") != "SATISFIED":
        reasons.append(
            {
                "code": "contract_not_satisfied",
                "state": candidate.get("contract_state"),
            }
        )
    if miss_rate > maximum_miss_rate:
        reasons.append(
            {
                "code": "observed_miss_rate_exceeds_contract",
                "observed_pct": miss_rate,
                "maximum_pct": maximum_miss_rate,
            }
        )
    if predicted_ns > deadline_ns:
        reasons.append(
            {
                "code": "predicted_deadline_miss",
                "predicted_ns": predicted_ns,
                "deadline_ns": deadline_ns,
            }
        )
    if domain != task["current_domain"] and policy.get("cooldown_active") is True:
        reasons.append({"code": "cooldown_active"})

    mcu_without_task = _require_number(
        mcu.get("utilization_without_task_pct"), "utilization_without_task_pct"
    )
    reserved_headroom = _require_number(
        mcu.get("reserved_headroom_pct"), "reserved_headroom_pct"
    )
    if mcu_without_task > 100 or reserved_headroom > 100:
        raise ValueError("MCU utilization and headroom percentages must not exceed 100")
    task_rate_hz = _require_number(task.get("rate_hz"), "rate_hz")
    task_mcu_utilization = 100 * task_rate_hz * local_p95_ns / 1_000_000_000
    projected_mcu_utilization = (
        mcu_without_task + task_mcu_utilization if domain == "rt" else mcu_without_task
    )
    usable_mcu_pct = 100 - reserved_headroom
    if domain == "rt" and projected_mcu_utilization > usable_mcu_pct:
        reasons.append(
            {
                "code": "mcu_headroom_exceeded",
                "projected_utilization_pct": projected_mcu_utilization,
                "usable_utilization_pct": usable_mcu_pct,
            }
        )

    return {
        "domain": domain,
        "admissible": not reasons,
        "selected": False,
        "rejection_reasons": reasons,
        "evidence_count": evidence_count,
        "contract_state": candidate.get("contract_state"),
        "observed_miss_rate_pct": miss_rate,
        "end_to_end_p95_ns": p95_ns,
        "local_execution_p95_ns": local_p95_ns,
        "chain_boundary_cost_ns": boundary_cost_ns,
        "chain_edges": boundary_edges,
        "predicted_end_to_end_ns": predicted_ns,
        "mcu": {
            "utilization_without_task_pct": mcu_without_task,
            "task_utilization_pct": task_mcu_utilization if domain == "rt" else 0.0,
            "projected_utilization_pct": projected_mcu_utilization,
            "reserved_headroom_pct": reserved_headroom,
            "usable_utilization_pct": usable_mcu_pct,
        },
    }


def _recommend_task(
    task: dict[str, Any], policy: dict[str, Any], mcu: dict[str, Any]
) -> dict[str, Any]:
    if task.get("current_domain") not in DOMAINS:
        raise ValueError(f"task {task['name']} has an invalid current_domain")
    if task.get("effect") not in {"Q_PURE", "Q_IDEMPOTENT", "Q_STATEFUL", "Q_ACTUATING"}:
        raise ValueError(f"task {task['name']} has an invalid effect")
    if not isinstance(task.get("contract"), dict):
        raise ValueError(f"task {task['name']} is missing its contract")
    evaluations = [_evaluate_candidate(task, domain, policy, mcu) for domain in DOMAINS]
    minimum_evidence = int(policy["minimum_evidence"])
    evidence_gate_passed = all(
        candidate["evidence_count"] >= minimum_evidence for candidate in evaluations
    )
    admissible = [candidate for candidate in evaluations if candidate["admissible"]]
    selected = None
    status = "withheld"
    if evidence_gate_passed and admissible:
        selected = min(
            admissible,
            key=lambda candidate: (candidate["predicted_end_to_end_ns"], candidate["domain"]),
        )
        selected["selected"] = True
        status = "recommendation"
        for candidate in admissible:
            if candidate is not selected:
                candidate["rejection_reasons"].append(
                    {
                        "code": "higher_predicted_end_to_end",
                        "selected_domain": selected["domain"],
                        "delta_ns": (
                            candidate["predicted_end_to_end_ns"]
                            - selected["predicted_end_to_end_ns"]
                        ),
                    }
                )

    canonical_input = json.dumps(
        {"task": task, "policy": policy, "mcu": mcu},
        sort_keys=True,
        separators=(",", ":"),
    )
    return {
        "task": task["name"],
        "record_id": hashlib.sha256(canonical_input.encode()).hexdigest(),
        "status": status,
        "current_domain": task["current_domain"],
        "recommended_domain": None if selected is None else selected["domain"],
        "evidence_gate_passed": evidence_gate_passed,
        "advisory_only": True,
        "placement_changed": False,
        "candidates": evaluations,
    }


def recommend(document: dict[str, Any], *, task_filter: str | None = None) -> dict[str, Any]:
    _validate_document(document)
    tasks = document["tasks"]
    if task_filter is not None:
        tasks = [task for task in tasks if task["name"] == task_filter]
        if not tasks:
            raise ValueError(f"recommendation task not found: {task_filter}")
    records = [_recommend_task(task, document["policy"], document["mcu"]) for task in tasks]
    return {
        "schema_version": RECOMMENDATION_SCHEMA_VERSION,
        "policy": "gated-static-end-to-end-v1",
        "advisory_only": True,
        "placement_changes": 0,
        "records": records,
    }


def load_recommendation_input(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("recommendation input must be a JSON object")
    return value


def write_recommendation(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_recommendation(report: dict[str, Any]) -> str:
    lines = ["QFabric static recommendations (advisory only)"]
    for record in report["records"]:
        recommendation = record["recommended_domain"] or "withheld"
        lines.append(
            f"- {record['task']}: {recommendation} "
            f"(current={record['current_domain']}, status={record['status']})"
        )
        for candidate in record["candidates"]:
            reasons = ", ".join(reason["code"] for reason in candidate["rejection_reasons"])
            lines.append(
                f"  - {candidate['domain']}: predicted="
                f"{candidate['predicted_end_to_end_ns'] / 1_000:.3f} us"
                + (f", rejected={reasons}" if reasons else ", selected")
            )
    return "\n".join(lines)
