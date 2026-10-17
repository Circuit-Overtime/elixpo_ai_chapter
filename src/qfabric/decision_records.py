from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .decision_history import DecisionStore
from .recommendation import recommend
from .recovery import RecoveryObservation, RecoveryPolicy, replay_recovery


def _reason_codes(candidate: dict[str, Any]) -> set[str]:
    return {reason["code"] for reason in candidate["rejection_reasons"]}


def _candidate_facts(candidate: dict[str, Any]) -> dict[str, Any]:
    reasons = _reason_codes(candidate)
    end_to_end = candidate["end_to_end_p95_ns"]
    local = candidate["local_execution_p95_ns"]
    return {
        "domain": candidate["domain"],
        "selected": candidate["selected"],
        "admissible": candidate["admissible"],
        "costs_ns": {
            "local_execution_p95": local,
            "communication_p95": max(0, end_to_end - local),
            "end_to_end_p95": end_to_end,
            "chain_boundary": candidate["chain_boundary_cost_ns"],
            "predicted_end_to_end": candidate["predicted_end_to_end_ns"],
        },
        "chain_edges": candidate["chain_edges"],
        "contract": {
            "state": candidate["contract_state"],
            "evidence_count": candidate["evidence_count"],
            "observed_miss_rate_pct": candidate["observed_miss_rate_pct"],
        },
        "semantic_eligible": "semantic_ineligible" not in reasons,
        "admission_allowed": "destination_not_admitted" not in reasons,
        "mcu_headroom_allowed": "mcu_headroom_exceeded" not in reasons,
        "mcu": candidate["mcu"],
        "rejection_reasons": candidate["rejection_reasons"],
    }


def _classifications(record: dict[str, Any]) -> list[str]:
    classifications = set()
    candidates = record["candidates"]
    selected = next((item for item in candidates if item["selected"]), None)
    for candidate in candidates:
        reasons = _reason_codes(candidate)
        if "insufficient_evidence" in reasons:
            classifications.add("insufficient_evidence")
        if "semantic_ineligible" in reasons:
            classifications.add("unsafe_semantics")
        if reasons & {"destination_not_admitted", "mcu_headroom_exceeded"}:
            classifications.add("failed_admission")
        if "higher_predicted_end_to_end" in reasons and selected is not None:
            candidate_communication = (
                candidate["end_to_end_p95_ns"]
                - candidate["local_execution_p95_ns"]
            )
            selected_communication = (
                selected["end_to_end_p95_ns"] - selected["local_execution_p95_ns"]
            )
            if candidate_communication > selected_communication:
                classifications.add("excessive_rpc_cost")
        if reasons & {
            "contract_not_satisfied",
            "observed_miss_rate_exceeds_contract",
            "predicted_deadline_miss",
        }:
            classifications.add("timing_infeasible")
    return sorted(classifications)


def recommendation_facts(
    recommendation_input: dict[str, Any], report: dict[str, Any]
) -> dict[str, Any]:
    if len(report["records"]) != 1:
        raise ValueError("decision recording requires exactly one recommendation task")
    record = report["records"][0]
    task = next(
        item for item in recommendation_input["tasks"] if item["name"] == record["task"]
    )
    return {
        "decision": {
            "status": record["status"],
            "current_domain": record["current_domain"],
            "selected_domain": record["recommended_domain"],
            "move_accepted": (
                record["recommended_domain"] is not None
                and record["recommended_domain"] != record["current_domain"]
            ),
            "classifications": _classifications(record),
        },
        "contract": task["contract"],
        "observation": {
            "window": None,
            "confidence": None,
            "sample_counts": {
                candidate["domain"]: candidate["evidence_count"]
                for candidate in record["candidates"]
            },
        },
        "candidates": [_candidate_facts(item) for item in record["candidates"]],
        "thresholds": {
            "minimum_evidence": recommendation_input["policy"]["minimum_evidence"],
            "deadline_ns": task["contract"]["deadline_ns"],
            "max_miss_rate_pct": task["contract"]["max_miss_rate_pct"],
            "cooldown_active": recommendation_input["policy"]["cooldown_active"],
        },
        "rollback_condition": None,
        "post_switch_verification": None,
    }


def record_recommendation(
    store: DecisionStore,
    recommendation_input: dict[str, Any],
    *,
    task: str,
) -> dict[str, Any]:
    report = recommend(recommendation_input, task_filter=task)
    return store.append(
        kind="recommendation",
        task=task,
        policy_name="gated-static-end-to-end",
        policy_version=1,
        decision_input={
            "recommendation_input": recommendation_input,
            "task_filter": task,
        },
        outcome=report,
        facts=recommendation_facts(recommendation_input, report),
    )


def _recovery_facts(
    hardware_report: dict[str, Any],
    recommendation_input: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    evidence = hardware_report["evidence"]["decisions"][index]
    step = hardware_report["runtime"]["recovery"]["steps"][index]
    recommendation_report = evidence["recommendation"]
    facts = recommendation_facts(recommendation_input, recommendation_report)
    contract_window = evidence["contract"]
    rollback = next(
        (
            action.get("reason")
            for action in step["actions"]
            if action["type"] == "rollback_armed"
        ),
        None,
    )
    action_types = [action["type"] for action in step["actions"]]
    classifications = set(facts["decision"]["classifications"])
    if rollback is not None:
        classifications.add("failed_probation")
    if "infeasible" in action_types or "infeasible_hold" in action_types:
        classifications.add("infeasibility")
    facts.update(
        {
            "decision": {
                **facts["decision"],
                "state_before": step["before"]["state"],
                "state_after": step["after"]["state"],
                "actions": step["actions"],
                "classifications": sorted(classifications),
            },
            "contract": hardware_report["evidence"]["contract"],
            "observation": {
                "window": contract_window["window_index"],
                "sample_count": contract_window["sample_count"],
                "confidence": contract_window["confidence"],
                "state_before": contract_window["state_before"],
                "state_after": contract_window["state_after"],
                "misses": contract_window["misses"],
                "miss_rate_pct": contract_window["miss_rate_pct"],
            },
            "thresholds": {
                **facts["thresholds"],
                "recovery_policy": hardware_report["runtime"]["recovery"]["policy"],
                "cooldown_remaining": step["after"]["cooldown_remaining"],
                "blacklist_remaining": step["after"]["blacklist_remaining"],
            },
            "rollback_condition": rollback,
            "post_switch_verification": {
                "target_contract_state": step["observation"]["target_contract_state"],
                "protected_contracts_healthy": step["observation"][
                    "protected_contracts_healthy"
                ],
                "probation_healthy_streak": step["after"][
                    "probation_healthy_streak"
                ],
                "probation_observed": step["after"]["probation_observed"],
            },
            "execution": hardware_report["runtime"]["windows"][index]["execution"],
        }
    )
    return facts


def record_hardware_recovery(
    store: DecisionStore,
    hardware_report: dict[str, Any],
    recommendation_input: dict[str, Any],
) -> list[dict[str, Any]]:
    recovery = hardware_report["runtime"]["recovery"]
    policy = RecoveryPolicy.from_dict(recovery["policy"])
    observations = [
        RecoveryObservation.from_dict(step["observation"]) for step in recovery["steps"]
    ]
    configuration = hardware_report["configuration"]
    initial_domain = recovery["steps"][0]["before"]["domain"]
    initial_epoch = configuration["initial_epoch"]
    replayed = replay_recovery(
        policy,
        observations,
        initial_domain=initial_domain,
        initial_epoch=initial_epoch,
    )
    if replayed != recovery:
        raise ValueError("hardware recovery report does not replay deterministically")
    if len(hardware_report["evidence"]["decisions"]) != len(observations):
        raise ValueError("hardware recovery evidence count does not match controller steps")

    records = []
    for index, _observation in enumerate(observations):
        prefix = observations[: index + 1]
        prefix_report = replay_recovery(
            policy,
            prefix,
            initial_domain=initial_domain,
            initial_epoch=initial_epoch,
        )
        records.append(
            store.append(
                kind="recovery",
                task=configuration["task"],
                policy_name="safe-closed-loop-recovery",
                policy_version=1,
                decision_input={
                    "policy": policy.to_dict(),
                    "initial": {"domain": initial_domain, "epoch": initial_epoch},
                    "observations": [asdict(item) for item in prefix],
                },
                outcome=prefix_report["steps"][-1],
                facts=_recovery_facts(hardware_report, recommendation_input, index),
            )
        )
    return records


def record_recovery_trace(
    store: DecisionStore,
    *,
    task: str,
    policy: RecoveryPolicy,
    observations: list[RecoveryObservation],
    initial_domain: str,
    initial_epoch: int,
    provenance: str,
) -> list[dict[str, Any]]:
    report = replay_recovery(
        policy,
        observations,
        initial_domain=initial_domain,
        initial_epoch=initial_epoch,
    )
    records = []
    for index, observation in enumerate(observations):
        prefix = observations[: index + 1]
        prefix_report = replay_recovery(
            policy,
            prefix,
            initial_domain=initial_domain,
            initial_epoch=initial_epoch,
        )
        step = report["steps"][index]
        actions = step["actions"]
        action_types = {action["type"] for action in actions}
        classifications = []
        if action_types & {"infeasible", "infeasible_hold"}:
            classifications.append("infeasibility")
        rollback = next(
            (
                action.get("reason")
                for action in actions
                if action["type"] == "rollback_armed"
            ),
            None,
        )
        if rollback is not None:
            classifications.append("failed_probation")
        facts = {
            "provenance": provenance,
            "decision": {
                "state_before": step["before"]["state"],
                "state_after": step["after"]["state"],
                "actions": actions,
                "classifications": sorted(classifications),
            },
            "contract": None,
            "observation": {
                "window": index + 1,
                "sample_count": None,
                "confidence": None,
                "recovery_observation": asdict(observation),
            },
            "candidates": [],
            "thresholds": {
                "recovery_policy": policy.to_dict(),
                "cooldown_remaining": step["after"]["cooldown_remaining"],
                "blacklist_remaining": step["after"]["blacklist_remaining"],
            },
            "rollback_condition": rollback,
            "post_switch_verification": {
                "target_contract_state": observation.target_contract_state,
                "protected_contracts_healthy": observation.protected_contracts_healthy,
                "probation_healthy_streak": step["after"][
                    "probation_healthy_streak"
                ],
                "probation_observed": step["after"]["probation_observed"],
            },
        }
        records.append(
            store.append(
                kind="recovery",
                task=task,
                policy_name="safe-closed-loop-recovery",
                policy_version=1,
                decision_input={
                    "policy": policy.to_dict(),
                    "initial": {"domain": initial_domain, "epoch": initial_epoch},
                    "observations": [asdict(item) for item in prefix],
                },
                outcome=prefix_report["steps"][-1],
                facts=facts,
            )
        )
    return records


def replay_decision(record: dict[str, Any]) -> dict[str, Any]:
    if record["kind"] == "recommendation":
        source = record["input"]
        replayed = recommend(
            source["recommendation_input"], task_filter=source["task_filter"]
        )
    else:
        source = record["input"]
        policy = RecoveryPolicy.from_dict(source["policy"])
        observations = [
            RecoveryObservation.from_dict(value) for value in source["observations"]
        ]
        report = replay_recovery(
            policy,
            observations,
            initial_domain=source["initial"]["domain"],
            initial_epoch=source["initial"]["epoch"],
        )
        replayed = report["steps"][-1]
    matches = replayed == record["outcome"]
    return {
        "schema_version": 1,
        "decision_id": record["decision_id"],
        "record_sha256": record["record_sha256"],
        "policy": record["policy"],
        "kind": record["kind"],
        "task": record["task"],
        "status": "pass" if matches else "fail",
        "matches": matches,
        "recorded_outcome": record["outcome"],
        "replayed_outcome": replayed,
    }
