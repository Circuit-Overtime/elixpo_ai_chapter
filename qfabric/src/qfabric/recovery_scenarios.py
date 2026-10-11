from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .recovery import RecoveryObservation, RecoveryPolicy, RecoveryState, replay_recovery

SCENARIO_SCHEMA_VERSION = 1


def _observation(**changes: Any) -> RecoveryObservation:
    values = {
        "source_contract_state": "SATISFIED",
        "evidence_valid": True,
        "recommended_domain": None,
        "semantic_eligible": False,
        "admission_allowed": False,
        "predicted_feasible": False,
        "safe_boundary": False,
        "target_contract_state": None,
        "protected_contracts_healthy": True,
        "transient_misses": 0,
        "alternatives_exhausted": False,
    }
    values.update(changes)
    return RecoveryObservation(**values)


def _violation(**changes: Any) -> RecoveryObservation:
    values = {
        "source_contract_state": "VIOLATED",
        "evidence_valid": True,
        "recommended_domain": "rt",
        "semantic_eligible": True,
        "admission_allowed": True,
        "predicted_feasible": True,
    }
    values.update(changes)
    return _observation(**values)


def _actions(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [action for step in report["steps"] for action in step["actions"]]


def run_recovery_scenarios() -> dict[str, object]:
    policy = RecoveryPolicy(
        probation_windows=3,
        probation_max_windows=5,
        cooldown_windows=3,
        blacklist_windows=5,
    )
    definitions: list[dict[str, Any]] = [
        {
            "name": "noise-and-insufficient-evidence",
            "observations": [
                _observation(source_contract_state="AT_RISK"),
                _violation(evidence_valid=False, safe_boundary=True),
                _observation(),
            ],
            "expected_state": "MONITORING",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 0, "false_switches": 0},
            "required_actions": {"monitor"},
            "forbidden_actions": {"switch"},
        },
        {
            "name": "successful-recovery",
            "observations": [
                _violation(safe_boundary=False),
                _violation(safe_boundary=False),
                _violation(safe_boundary=True),
                _observation(target_contract_state="SATISFIED", transient_misses=1),
                _observation(target_contract_state="SATISFIED"),
                _observation(target_contract_state="SATISFIED"),
            ],
            "expected_state": "COOLDOWN",
            "expected_domain": "rt",
            "metrics": {"switch_attempts": 1, "commits": 1, "rollbacks": 0},
            "required_actions": {"boundary_wait", "switch", "commit"},
            "forbidden_actions": {"rollback"},
        },
        {
            "name": "semantic-rejection",
            "observations": [_violation(semantic_eligible=False, safe_boundary=True)],
            "expected_state": "MONITORING",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 0},
            "required_actions": {"recovery_rejected"},
            "required_reason": "semantic_ineligible",
            "forbidden_actions": {"switch"},
        },
        {
            "name": "admission-rejection",
            "observations": [_violation(admission_allowed=False, safe_boundary=True)],
            "expected_state": "MONITORING",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 0},
            "required_actions": {"recovery_rejected"},
            "required_reason": "destination_not_admitted",
            "forbidden_actions": {"switch"},
        },
        {
            "name": "target-failure-rollback",
            "observations": [
                _violation(safe_boundary=True),
                _observation(
                    target_contract_state="VIOLATED",
                    safe_boundary=True,
                    transient_misses=3,
                ),
            ],
            "expected_state": "COOLDOWN",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 1, "commits": 0, "rollbacks": 1},
            "required_actions": {"switch", "rollback_armed", "rollback"},
            "forbidden_actions": {"commit"},
        },
        {
            "name": "protected-regression-deferred-rollback",
            "observations": [
                _violation(safe_boundary=True),
                _observation(
                    target_contract_state="SATISFIED",
                    protected_contracts_healthy=False,
                    safe_boundary=False,
                    transient_misses=2,
                ),
                _observation(safe_boundary=False),
                _observation(safe_boundary=True),
            ],
            "expected_state": "COOLDOWN",
            "expected_domain": "linux",
            "metrics": {
                "switch_attempts": 1,
                "rollbacks": 1,
                "protected_contract_regressions": 1,
            },
            "required_actions": {
                "switch",
                "rollback_armed",
                "rollback_deferred",
                "rollback",
            },
            "forbidden_actions": {"commit"},
        },
        {
            "name": "probation-timeout",
            "observations": [
                _violation(safe_boundary=True),
                _observation(target_contract_state="UNKNOWN"),
                _observation(target_contract_state="UNKNOWN"),
                _observation(target_contract_state="AT_RISK"),
                _observation(target_contract_state="UNKNOWN"),
                _observation(target_contract_state="UNKNOWN", safe_boundary=True),
            ],
            "expected_state": "COOLDOWN",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 1, "commits": 0, "rollbacks": 1},
            "required_actions": {"switch", "rollback_armed", "rollback"},
            "required_reason": "probation_timeout",
            "forbidden_actions": {"commit"},
        },
        {
            "name": "cooldown-and-blacklist",
            "observations": [
                _violation(safe_boundary=True),
                _observation(target_contract_state="VIOLATED", safe_boundary=True),
                _observation(),
                _observation(),
                _observation(),
                _violation(safe_boundary=True),
            ],
            "expected_state": "MONITORING",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 1, "rollbacks": 1},
            "required_actions": {"cooldown_complete", "recovery_rejected"},
            "required_reason": "candidate_blacklisted",
            "forbidden_actions": {"commit"},
        },
        {
            "name": "boundary-wait-cancelled",
            "observations": [
                _violation(safe_boundary=False),
                _observation(source_contract_state="SATISFIED", safe_boundary=True),
            ],
            "expected_state": "MONITORING",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 0},
            "required_actions": {"recovery_armed", "recovery_cancelled"},
            "required_reason": "violation_cleared",
            "forbidden_actions": {"switch"},
        },
        {
            "name": "alternatives-exhausted",
            "observations": [
                _violation(
                    recommended_domain=None,
                    alternatives_exhausted=True,
                    safe_boundary=True,
                ),
                _violation(
                    recommended_domain=None,
                    alternatives_exhausted=True,
                    safe_boundary=True,
                ),
            ],
            "expected_state": "INFEASIBLE",
            "expected_domain": "linux",
            "metrics": {"switch_attempts": 0, "oscillations": 0},
            "required_actions": {"infeasible", "infeasible_hold"},
            "forbidden_actions": {"switch", "rollback"},
        },
    ]

    results = []
    all_states: set[str] = set()
    for definition in definitions:
        observations = definition["observations"]
        report = replay_recovery(
            policy,
            observations,
            initial_domain="linux",
            initial_epoch=1,
        )
        repeated = replay_recovery(
            policy,
            observations,
            initial_domain="linux",
            initial_epoch=1,
        )
        actions = _actions(report)
        action_types = {action["type"] for action in actions}
        reasons = {action.get("reason") for action in actions if "reason" in action}
        all_states.add("MONITORING")
        for step in report["steps"]:
            all_states.add(step["before"]["state"])
            all_states.add(step["after"]["state"])
        checks = {
            "final_state": report["final"]["state"] == definition["expected_state"],
            "final_domain": report["final"]["domain"] == definition["expected_domain"],
            "metrics": all(
                report["metrics"][name] == value
                for name, value in definition["metrics"].items()
            ),
            "required_actions": definition["required_actions"] <= action_types,
            "forbidden_actions": not (definition["forbidden_actions"] & action_types),
            "required_reason": (
                definition.get("required_reason") is None
                or definition["required_reason"] in reasons
            ),
            "safe_domain_changes": all(
                action.get("safe_boundary") is True
                for action in actions
                if action["type"] in {"switch", "rollback"}
            ),
            "epoch_consistent": (
                report["final"]["epoch"]
                == 1 + report["metrics"]["domain_changes"]
            ),
            "deterministic": report == repeated,
            "no_false_switch": report["metrics"]["false_switches"] == 0,
        }
        results.append(
            {
                "name": definition["name"],
                "provenance": "controlled-fault-injection-not-hardware-performance",
                "expected": {
                    "state": definition["expected_state"],
                    "domain": definition["expected_domain"],
                    "metrics": definition["metrics"],
                },
                "observations": [asdict(observation) for observation in observations],
                "report": report,
                "checks": checks,
                "passed": all(checks.values()),
            }
        )

    required_states = sorted(state.value for state in RecoveryState)
    state_coverage = sorted(all_states)
    failures = [result["name"] for result in results if not result["passed"]]
    if state_coverage != required_states:
        failures.append("state-coverage")

    attempts = sum(result["report"]["metrics"]["switch_attempts"] for result in results)
    commits = sum(result["report"]["metrics"]["commits"] for result in results)
    rollbacks = sum(result["report"]["metrics"]["rollbacks"] for result in results)
    return {
        "schema_version": SCENARIO_SCHEMA_VERSION,
        "protocol": "safe-closed-loop-recovery-v1",
        "provenance": "controlled-fault-injection-not-hardware-performance",
        "status": "pass" if not failures else "fail",
        "scenario_count": len(results),
        "state_coverage": state_coverage,
        "required_states": required_states,
        "aggregate_metrics": {
            "switch_attempts": attempts,
            "commits": commits,
            "rollbacks": rollbacks,
            "successful_recovery_rate_pct": 100 * commits / attempts if attempts else None,
            "rollback_rate_pct": 100 * rollbacks / attempts if attempts else None,
            "false_switches": sum(
                result["report"]["metrics"]["false_switches"] for result in results
            ),
            "transient_misses": sum(
                result["report"]["metrics"]["transient_misses"] for result in results
            ),
            "protected_contract_regressions": sum(
                result["report"]["metrics"]["protected_contract_regressions"]
                for result in results
            ),
            "oscillations": sum(
                result["report"]["metrics"]["oscillations"] for result in results
            ),
            "detection_delay_windows": [
                value
                for result in results
                for value in result["report"]["metrics"]["detection_delay_windows"]
            ],
            "verified_recovery_windows": [
                value
                for result in results
                for value in result["report"]["metrics"]["verified_recovery_windows"]
            ],
        },
        "failures": failures,
        "scenarios": results,
    }


def write_recovery_scenarios(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
