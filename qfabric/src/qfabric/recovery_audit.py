from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .contracts import DeadlineContract
from .recovery import RecoveryController, RecoveryPolicy
from .recovery_closed_loop import ClosedLoopEvidenceProvider
from .recovery_runtime import ExecutionSample, ExecutionWindow
from .recovery_scenarios import run_recovery_scenarios


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _execution_window(value: dict[str, Any]) -> ExecutionWindow:
    return ExecutionWindow(
        window_index=value["window_index"],
        domain=value["domain"],
        epoch=value["epoch"],
        samples=tuple(ExecutionSample(**sample) for sample in value["samples"]),
        protected_contracts_healthy=value["protected_contracts_healthy"],
        in_flight_after=value["in_flight_after"],
    )


def _audit_hardware(
    report: dict[str, Any],
    recommendation_input: dict[str, Any],
    *,
    expected_mode: str,
) -> tuple[list[str], dict[str, object]]:
    failures: list[str] = []
    label = f"hardware {expected_mode}"
    configuration = report["configuration"]
    runtime = report["runtime"]
    persisted_recovery = runtime["recovery"]
    windows = runtime["windows"]
    injection = report["injection"]

    if report.get("campaign") != "bounded-hardware-recovery-v1":
        failures.append(f"{label} campaign identity is invalid")
    if report.get("mode") != expected_mode:
        failures.append(f"{label} mode is invalid")
    if configuration.get("maximum_windows") != 9 or runtime.get("window_count") != 9:
        failures.append(f"{label} did not contain exactly nine windows")
    if len(windows) != runtime.get("window_count"):
        failures.append(f"{label} runtime window count is inconsistent")
    if configuration.get("protected_contracts_declared") is not False:
        failures.append(f"{label} protected-contract declaration is invalid")
    if injection.get("provenance") != "controlled-delay-injection":
        failures.append(f"{label} injection provenance is invalid")

    expected_fault_windows = list(range(1, 4 if expected_mode == "success" else 7))
    if injection.get("windows") != expected_fault_windows:
        failures.append(f"{label} injection window plan is invalid")
    delay_ns = injection.get("delay_ns")
    if not isinstance(delay_ns, int) or delay_ns < 1:
        failures.append(f"{label} injection delay is invalid")
        delay_ns = 0

    policy = RecoveryPolicy.from_dict(persisted_recovery["policy"])
    first_before = persisted_recovery["steps"][0]["before"]
    controller = RecoveryController(
        policy,
        initial_domain=first_before["domain"],
        initial_epoch=configuration["initial_epoch"],
    )
    contract = DeadlineContract.from_dict(report["evidence"]["contract"])
    provider = ClosedLoopEvidenceProvider(
        recommendation_input,
        contract,
        task=configuration["task"],
    )
    replayed_transitions: list[dict[str, object]] = []

    for index, entry in enumerate(windows, start=1):
        window = _execution_window(entry["execution"])
        if window.window_index != index:
            failures.append(f"{label} window sequence is not contiguous")
        if window.domain != controller.current_domain or window.epoch != controller.epoch:
            failures.append(f"{label} placement diverged before window {index}")
        if len(window.samples) != configuration["invocations_per_window"]:
            failures.append(f"{label} sample count is invalid in window {index}")
        expected_delay = delay_ns if index in expected_fault_windows else 0
        for sample in window.samples:
            if sample.injected_delay_ns != expected_delay:
                failures.append(f"{label} sample injection label is invalid in window {index}")
                break
            if expected_delay and (
                sample.outcome != "ok"
                or sample.latency_ns is None
                or sample.latency_ns < expected_delay
            ):
                failures.append(f"{label} injected delay is not reflected in window {index}")
                break

        observation = provider(window, controller)
        persisted_step = persisted_recovery["steps"][index - 1]
        if provider.decisions[-1] != report["evidence"]["decisions"][index - 1]:
            failures.append(f"{label} dynamic evidence differs at window {index}")
        if persisted_step["observation"] != provider.decisions[-1]["observation"]:
            failures.append(f"{label} controller observation differs at window {index}")
        replayed_step = controller.add(observation)
        if replayed_step != persisted_step:
            failures.append(f"{label} controller replay differs at window {index}")
        applied = []
        for action in replayed_step["actions"]:
            if action["type"] not in {"switch", "rollback"}:
                continue
            transition = {
                "window_index": index,
                "type": action["type"],
                "domain": (
                    action["destination"]
                    if action["type"] == "switch"
                    else action["restored_domain"]
                ),
                "epoch": action["epoch"],
                "safe_boundary": True,
            }
            replayed_transitions.append(transition)
            applied.append(transition)
        if applied != entry["applied_transitions"]:
            failures.append(f"{label} applied transitions differ at window {index}")

    replayed_recovery = controller.report()
    if replayed_recovery != persisted_recovery:
        failures.append(f"{label} complete controller replay is not deterministic")
    if provider.report() != report["evidence"]:
        failures.append(f"{label} contract or recommendation evidence is not deterministic")
    if replayed_transitions != runtime["transitions"]:
        failures.append(f"{label} transition log is not deterministic")

    expected = {
        "final_domain": "rt" if expected_mode == "success" else "linux",
        "commits": 1 if expected_mode == "success" else 0,
        "rollbacks": 0 if expected_mode == "success" else 1,
        "final_state": "MONITORING",
    }
    observed = {
        "final_domain": replayed_recovery["final"]["domain"],
        "commits": replayed_recovery["metrics"]["commits"],
        "rollbacks": replayed_recovery["metrics"]["rollbacks"],
        "final_state": replayed_recovery["final"]["state"],
    }
    if report.get("expected") != expected or report.get("observed") != observed:
        failures.append(f"{label} expected or observed outcome is invalid")
    if report.get("status") != "pass" or report.get("failures") != []:
        failures.append(f"{label} persisted campaign did not pass")

    return failures, {
        "mode": expected_mode,
        "windows": len(windows),
        "samples": sum(len(entry["execution"]["samples"]) for entry in windows),
        "transitions": len(replayed_transitions),
        "final_domain": observed["final_domain"],
        "commits": observed["commits"],
        "rollbacks": observed["rollbacks"],
        "final_state": observed["final_state"],
        "replay_valid": not failures,
    }


def audit_stage7(root: Path, recommendation_input_path: Path) -> dict[str, object]:
    failures: list[str] = []
    recommendation_input = _load_json(recommendation_input_path)

    persisted_scenarios = _load_json(root / "recovery-scenarios.json")
    recomputed_scenarios = run_recovery_scenarios()
    if persisted_scenarios != recomputed_scenarios:
        failures.append("deterministic recovery scenarios do not reproduce")
    if recomputed_scenarios["status"] != "pass":
        failures.append("deterministic recovery scenario suite failed")

    hardware = []
    for mode in ("success", "rollback"):
        report = _load_json(root / f"hardware-{mode}.json")
        campaign_failures, summary = _audit_hardware(
            report,
            recommendation_input,
            expected_mode=mode,
        )
        failures.extend(campaign_failures)
        hardware.append(summary)

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 7,
        "claim": "boundary-safe-empirical-closed-loop-recovery",
        "status": "pass" if not failures else "fail",
        "sources": {
            "root": str(root),
            "recommendation_input": str(recommendation_input_path),
        },
        "deterministic_scenarios": {
            "count": recomputed_scenarios["scenario_count"],
            "state_coverage": recomputed_scenarios["state_coverage"],
            "status": recomputed_scenarios["status"],
        },
        "hardware": hardware,
        "failures": failures,
    }


def write_stage7_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
