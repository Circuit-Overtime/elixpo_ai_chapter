from __future__ import annotations

import copy
import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .contracts import (
    ContractObservation,
    DeadlineContract,
    DeadlineContractEvaluator,
)
from .profiling import percentile
from .recommendation import recommend
from .recovery import RecoveryController, RecoveryObservation, RecoveryPolicy
from .recovery_runtime import DualDomainAddBackend, ExecutionWindow, RecoveryExecutor


class ClosedLoopEvidenceProvider:
    def __init__(
        self,
        recommendation_input: dict[str, Any],
        contract: DeadlineContract,
        *,
        task: str,
    ):
        matches = [
            item
            for item in recommendation_input.get("tasks", [])
            if item.get("name") == task
        ]
        if len(matches) != 1:
            raise ValueError(f"expected exactly one recommendation input task named {task}")
        self.base = copy.deepcopy(recommendation_input)
        self.task = task
        self.contract = contract
        self.evaluators = {
            domain: DeadlineContractEvaluator(contract) for domain in ("linux", "rt")
        }
        self.live: dict[str, dict[str, Any]] = {}
        self.decisions: list[dict[str, object]] = []

    def __call__(
        self, window: ExecutionWindow, controller: RecoveryController
    ) -> RecoveryObservation:
        evaluator = self.evaluators[window.domain]
        contract_window = None
        successful_latencies = []
        for sample in window.samples:
            if sample.outcome == "ok" and sample.latency_ns is not None:
                observation = ContractObservation("ok", sample.latency_ns)
                successful_latencies.append(sample.latency_ns)
            else:
                observation = ContractObservation(sample.outcome)
            result = evaluator.add(observation)
            if result is not None:
                contract_window = result
        if contract_window is None:
            raise RuntimeError("execution window did not complete one contract window")
        if successful_latencies:
            p95_ns = percentile(successful_latencies, 95)
        else:
            p95_ns = self.contract.deadline_ns + 1
        self.live[window.domain] = {
            "state": evaluator.state.value,
            "miss_rate_pct": contract_window["miss_rate_pct"],
            "p95_ns": p95_ns,
            "window": contract_window,
        }

        dynamic_input = copy.deepcopy(self.base)
        task_input = next(item for item in dynamic_input["tasks"] if item["name"] == self.task)
        task_input["current_domain"] = controller.current_domain
        dynamic_input["policy"]["cooldown_active"] = controller.state.value == "COOLDOWN"
        for domain, live in self.live.items():
            candidate = task_input["candidates"][domain]
            candidate["contract_state"] = live["state"]
            candidate["observed_miss_rate_pct"] = live["miss_rate_pct"]
            candidate["end_to_end_p95_ns"] = live["p95_ns"]
        recommendation = recommend(dynamic_input)
        record = recommendation["records"][0]
        selected = record["recommended_domain"]
        destination = selected if selected != controller.current_domain else None
        destination_candidate = next(
            (
                candidate
                for candidate in record["candidates"]
                if candidate["domain"] == destination
            ),
            None,
        )
        reasons = (
            set()
            if destination_candidate is None
            else {
                reason["code"]
                for reason in destination_candidate["rejection_reasons"]
            }
        )
        source_live = self.live[window.domain]
        target_state = (
            source_live["state"]
            if controller.state.value in {"PROBATION", "ROLLBACK_WAIT"}
            else None
        )
        observation = RecoveryObservation(
            source_contract_state=source_live["state"],
            evidence_valid=contract_window["estimator_valid"],
            recommended_domain=destination,
            semantic_eligible=(
                destination_candidate is not None and "semantic_ineligible" not in reasons
            ),
            admission_allowed=(
                destination_candidate is not None
                and not reasons.intersection(
                    {"destination_not_admitted", "mcu_headroom_exceeded"}
                )
            ),
            predicted_feasible=(
                destination_candidate is not None
                and not reasons.intersection(
                    {
                        "contract_not_satisfied",
                        "observed_miss_rate_exceeds_contract",
                        "predicted_deadline_miss",
                    }
                )
            ),
            safe_boundary=window.safe_boundary,
            target_contract_state=target_state,
            protected_contracts_healthy=window.protected_contracts_healthy,
            transient_misses=contract_window["misses"],
            alternatives_exhausted=False,
        )
        self.decisions.append(
            {
                "window_index": window.window_index,
                "domain": window.domain,
                "contract": contract_window,
                "recommendation": recommendation,
                "observation": asdict(observation),
            }
        )
        return observation

    def report(self) -> dict[str, object]:
        return {
            "contract": self.contract.to_dict(),
            "live_domains": {
                domain: {
                    "state": evaluator.state.value,
                    "report": evaluator.report(),
                }
                for domain, evaluator in self.evaluators.items()
            },
            "decisions": self.decisions,
        }


def run_hardware_recovery(
    root: Path,
    address: str,
    recommendation_input: dict[str, Any],
    *,
    mode: str,
    task: str,
    initial_epoch: int,
    invocations_per_window: int = 20,
    deadline_ns: int = 20_000_000,
    injected_delay_ns: int = 20_000_000,
    timeout: float = 2.0,
) -> dict[str, object]:
    if mode not in {"success", "rollback"}:
        raise ValueError("hardware recovery mode must be success or rollback")
    if initial_epoch < 0:
        raise ValueError("initial_epoch must not be negative")
    if invocations_per_window < 1:
        raise ValueError("invocations_per_window must be positive")
    if deadline_ns < 1:
        raise ValueError("deadline_ns must be positive")
    if injected_delay_ns < 1:
        raise ValueError("injected_delay_ns must be positive")
    policy = RecoveryPolicy(
        probation_windows=3,
        probation_max_windows=5,
        cooldown_windows=3,
        blacklist_windows=5,
    )
    contract = DeadlineContract(
        deadline_ns=deadline_ns,
        window_size=invocations_per_window,
        minimum_samples=invocations_per_window,
        warmup_samples=0,
        max_miss_rate_pct=1.0,
        at_risk_miss_rate_pct=0.5,
        recovery_miss_rate_pct=0.25,
        violation_windows=3,
        recovery_windows=3,
        infeasible_windows=5,
    )
    fault_end = 3 if mode == "success" else 6
    fault_plan = {window: injected_delay_ns for window in range(1, fault_end + 1)}
    controller = RecoveryController(
        policy,
        initial_domain="linux",
        initial_epoch=initial_epoch,
    )
    provider = ClosedLoopEvidenceProvider(recommendation_input, contract, task=task)
    backend = DualDomainAddBackend(
        root,
        address,
        initial_domain="linux",
        initial_epoch=initial_epoch,
        invocations_per_window=invocations_per_window,
        timeout=timeout,
        injected_delay_ns=fault_plan,
        protected_contracts_declared=False,
    )
    runtime = RecoveryExecutor(controller, backend, provider).run(9)
    expected = {
        "final_domain": "rt" if mode == "success" else "linux",
        "commits": 1 if mode == "success" else 0,
        "rollbacks": 0 if mode == "success" else 1,
        "final_state": "MONITORING",
    }
    observed = {
        "final_domain": runtime["recovery"]["final"]["domain"],
        "commits": runtime["recovery"]["metrics"]["commits"],
        "rollbacks": runtime["recovery"]["metrics"]["rollbacks"],
        "final_state": runtime["recovery"]["final"]["state"],
    }
    checks = {name: observed[name] == value for name, value in expected.items()}
    boundary_checks = all(
        transition["safe_boundary"] is True for transition in runtime["transitions"]
    )
    checks["safe_boundaries"] = boundary_checks
    checks["epoch_consistency"] = (
        runtime["recovery"]["final"]["epoch"]
        == initial_epoch + runtime["recovery"]["metrics"]["domain_changes"]
    )
    failures = [name for name, passed in checks.items() if not passed]
    return {
        "schema_version": 1,
        "campaign": "bounded-hardware-recovery-v1",
        "captured_utc": datetime.now(UTC).isoformat(),
        "mode": mode,
        "injection": {
            "provenance": "controlled-delay-injection",
            "delay_ns": injected_delay_ns,
            "windows": sorted(fault_plan),
        },
        "configuration": {
            "task": task,
            "initial_epoch": initial_epoch,
            "invocations_per_window": invocations_per_window,
            "deadline_ns": deadline_ns,
            "maximum_windows": 9,
            "protected_contracts_declared": False,
        },
        "expected": expected,
        "observed": observed,
        "checks": checks,
        "failures": failures,
        "status": "pass" if not failures else "fail",
        "evidence": provider.report(),
        "runtime": runtime,
    }


def write_hardware_recovery(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
