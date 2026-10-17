from __future__ import annotations

import itertools
import json
import math
from collections import Counter
from dataclasses import replace
from pathlib import Path
from typing import Any

from .contracts import (
    CONTRACT_SCHEMA_VERSION,
    ContractObservation,
    ContractState,
    DeadlineContract,
    replay_contract,
)

SENSITIVITY_SCHEMA_VERSION = 1
SCENARIO_SCHEMA_VERSION = 1


def profile_group_to_trace(
    profile: dict[str, object],
    contract: DeadlineContract,
    *,
    task: str,
    domain: str,
    instrumentation: str,
) -> dict[str, object]:
    groups = profile["groups"]
    matches = [
        group
        for group in groups
        if group.get("task") == task
        and group.get("domain") == domain
        and group.get("instrumentation") == instrumentation
    ]
    if len(matches) != 1:
        raise ValueError(
            "profile selector must match exactly one group: "
            f"task={task}, domain={domain}, instrumentation={instrumentation}; "
            f"matched {len(matches)}"
        )
    group = matches[0]
    observations = [_sample_to_observation(sample) for sample in group["samples"]]
    return {
        "schema_version": CONTRACT_SCHEMA_VERSION,
        "contract": contract.to_dict(),
        "provenance": {
            "source": "qfabric-stage4-profile",
            "source_profile_schema_version": profile["schema_version"],
            "task": task,
            "domain": domain,
            "instrumentation": instrumentation,
            "source_retained_samples": len(observations),
            "source_warmup_already_excluded": True,
        },
        "observations": [observation.to_dict() for observation in observations],
    }


def _sample_to_observation(sample: dict[str, Any]) -> ContractObservation:
    outcome = sample.get("outcome")
    latency = sample.get("end_to_end_ns")
    if outcome == "ok" and isinstance(latency, int) and latency >= 0:
        return ContractObservation("ok", latency)
    if outcome in {"error", "timeout"}:
        return ContractObservation(outcome)
    return ContractObservation("missing")


def write_contract_trace(trace: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(trace, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_transition_scenario(
    contract: DeadlineContract, source_observations: list[ContractObservation]
) -> dict[str, object]:
    if contract.violation_windows < 2:
        raise ValueError("transition scenario requires violation_windows of at least 2")
    if contract.window_size < 2:
        raise ValueError("transition scenario requires window_size of at least 2")
    source_hits = [
        observation.latency_ns
        for observation in source_observations
        if observation.outcome == "ok"
        and observation.latency_ns is not None
        and observation.latency_ns <= contract.deadline_ns
    ]
    if not source_hits:
        raise ValueError("transition scenario requires at least one source deadline hit")

    observations: list[dict[str, object]] = []
    source_cursor = 0

    def append_hit(phase: str) -> None:
        nonlocal source_cursor
        source_index = source_cursor % len(source_hits)
        observations.append(
            {
                "outcome": "ok",
                "latency_ns": source_hits[source_index],
                "phase": phase,
                "injection": "none",
                "source_hit_index": source_index,
            }
        )
        source_cursor += 1

    def append_window(phase: str, misses: int, *, missing: bool = False) -> None:
        for index in range(contract.window_size):
            if index < misses:
                observations.append(
                    {
                        "outcome": "timeout" if missing else "ok",
                        "latency_ns": None if missing else contract.deadline_ns + 1,
                        "phase": phase,
                        "injection": "timeout" if missing else "deadline-plus-one-ns",
                        "source_hit_index": None,
                    }
                )
            else:
                append_hit(phase)

    for _ in range(contract.warmup_samples):
        append_hit("contract-warmup")

    phases: list[dict[str, object]] = []
    next_window = 1

    def add_phase(
        name: str,
        window_count: int,
        misses: int,
        expected_end_state: str,
        *,
        missing: bool = False,
    ) -> None:
        nonlocal next_window
        start_window = next_window
        for _ in range(window_count):
            append_window(name, misses, missing=missing)
            next_window += 1
        phases.append(
            {
                "name": name,
                "start_window": start_window,
                "end_window": next_window - 1,
                "expected_end_state": expected_end_state,
            }
        )

    add_phase("baseline-healthy", 1, 0, ContractState.SATISFIED.value)
    add_phase("isolated-spike", 1, 1, "NOT_VIOLATED")
    add_phase(
        "post-spike-recovery",
        contract.recovery_windows,
        0,
        ContractState.SATISFIED.value,
    )
    violating_misses = math.floor(
        contract.max_miss_rate_pct * contract.window_size / 100
    ) + 1
    add_phase(
        "sustained-violation",
        contract.violation_windows,
        violating_misses,
        ContractState.VIOLATED.value,
    )
    add_phase(
        "violation-recovery",
        contract.recovery_windows,
        0,
        ContractState.SATISFIED.value,
    )
    add_phase(
        "total-failure",
        contract.infeasible_windows,
        contract.window_size,
        ContractState.INFEASIBLE.value,
        missing=True,
    )
    add_phase(
        "infeasible-recovery",
        contract.recovery_windows,
        0,
        ContractState.SATISFIED.value,
    )
    return {
        "schema_version": CONTRACT_SCHEMA_VERSION,
        "contract": contract.to_dict(),
        "provenance": {
            "source": "controlled-transition-injection",
            "source_observations": len(source_observations),
            "source_deadline_hits": len(source_hits),
            "injected": True,
            "research_use": "state-machine-validation-not-hardware-performance",
        },
        "scenario": {
            "schema_version": SCENARIO_SCHEMA_VERSION,
            "violating_misses_per_window": violating_misses,
            "phases": phases,
        },
        "observations": observations,
    }


def audit_transition_scenario(trace: dict[str, object]) -> dict[str, object]:
    contract = DeadlineContract.from_dict(trace["contract"])
    observations = [
        ContractObservation.from_dict(observation) for observation in trace["observations"]
    ]
    replay = replay_contract(contract, observations)
    checks = []
    for phase in trace["scenario"]["phases"]:
        observed = replay["windows"][phase["end_window"] - 1]["state_after"]
        expected = phase["expected_end_state"]
        passed = (
            observed not in {ContractState.VIOLATED.value, ContractState.INFEASIBLE.value}
            if expected == "NOT_VIOLATED"
            else observed == expected
        )
        checks.append(
            {
                "phase": phase["name"],
                "end_window": phase["end_window"],
                "expected": expected,
                "observed": observed,
                "passed": passed,
            }
        )
    state_coverage = sorted(
        {replay["windows"][0]["state_before"]}
        | {window["state_after"] for window in replay["windows"]}
    )
    required_states = sorted(state.value for state in ContractState)
    coverage_passed = state_coverage == required_states
    checks.append(
        {
            "phase": "state-coverage",
            "expected": required_states,
            "observed": state_coverage,
            "passed": coverage_passed,
        }
    )
    failures = [check["phase"] for check in checks if not check["passed"]]
    return {
        "schema_version": SCENARIO_SCHEMA_VERSION,
        "claim": "controlled-state-machine-validation",
        "status": "pass" if not failures else "fail",
        "failures": failures,
        "checks": checks,
        "contract": contract.to_dict(),
        "replay": replay,
    }


def write_scenario_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def analyze_contract_sensitivity(
    base_contract: DeadlineContract,
    observations: list[ContractObservation],
    *,
    window_sizes: list[int],
    violation_windows: list[int],
    recovery_windows: list[int],
) -> dict[str, object]:
    for name, values in (
        ("window_sizes", window_sizes),
        ("violation_windows", violation_windows),
        ("recovery_windows", recovery_windows),
    ):
        if not values or any(value < 1 for value in values):
            raise ValueError(f"{name} must contain positive integers")
    if any(size < base_contract.minimum_samples for size in window_sizes):
        raise ValueError("every sensitivity window must be at least minimum_samples")

    configurations = []
    for window_size, violation_count, recovery_count in itertools.product(
        sorted(set(window_sizes)),
        sorted(set(violation_windows)),
        sorted(set(recovery_windows)),
    ):
        infeasible_count = max(base_contract.infeasible_windows, violation_count)
        contract = replace(
            base_contract,
            window_size=window_size,
            violation_windows=violation_count,
            recovery_windows=recovery_count,
            infeasible_windows=infeasible_count,
        )
        replay = replay_contract(contract, observations)
        first_entry = {
            state.value: next(
                (
                    window["window_index"]
                    for window in replay["windows"]
                    if window["state_after"] == state.value
                ),
                None,
            )
            for state in ContractState
            if state != ContractState.UNKNOWN
        }
        first_entry_observation = {
            state: (
                None
                if window_index is None
                else base_contract.warmup_samples + window_index * window_size
            )
            for state, window_index in first_entry.items()
        }
        configurations.append(
            {
                "window_size": window_size,
                "violation_windows": violation_count,
                "recovery_windows": recovery_count,
                "infeasible_windows": infeasible_count,
                "final_state": replay["state"],
                "complete_windows": len(replay["windows"]),
                "pending_samples": replay["pending_samples"],
                "transition_count": sum(
                    bool(window["transitioned"]) for window in replay["windows"]
                ),
                "first_entry_window": first_entry,
                "first_entry_observation": first_entry_observation,
                "sustained_violation_detection_bound_observations": (
                    base_contract.warmup_samples + violation_count * window_size
                ),
            }
        )

    state_counts = Counter(configuration["final_state"] for configuration in configurations)
    return {
        "schema_version": SENSITIVITY_SCHEMA_VERSION,
        "claim": "empirical-soft-real-time",
        "source_observations": len(observations),
        "base_contract": base_contract.to_dict(),
        "configuration_count": len(configurations),
        "final_state_counts": dict(sorted(state_counts.items())),
        "configurations": configurations,
    }


def write_sensitivity_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
