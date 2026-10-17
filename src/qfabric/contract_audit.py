from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .contract_analysis import audit_transition_scenario
from .contracts import ContractState, load_contract_trace, replay_contract
from .profiling import load_profile


def _load_json(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def audit_stage5(root: Path, *, minimum_hardware_observations: int = 1000) -> dict[str, object]:
    if minimum_hardware_observations < 1:
        raise ValueError("minimum_hardware_observations must be positive")
    failures: list[str] = []
    profile_path = root / "profile.json"
    profile = load_profile(profile_path)
    expected_groups = {("linux", "full"), ("rt", "full")}
    observed_groups = {
        (group["domain"], group["instrumentation"]) for group in profile["groups"]
    }
    if observed_groups != expected_groups:
        failures.append("hardware profile must contain exactly linux/full and rt/full")

    hardware: list[dict[str, object]] = []
    for domain in ("linux", "rt"):
        group = next(
            (
                item
                for item in profile["groups"]
                if item["domain"] == domain and item["instrumentation"] == "full"
            ),
            None,
        )
        trace_path = root / f"{domain}-trace.json"
        report_path = root / f"{domain}-report.json"
        sensitivity_path = root / f"{domain}-sensitivity.json"
        injected_path = root / f"{domain}-injected-trace.json"
        scenario_path = root / f"{domain}-scenario.json"
        contract, observations = load_contract_trace(trace_path)
        trace_document = _load_json(trace_path)
        persisted_replay = _load_json(report_path)
        recomputed_replay = replay_contract(contract, observations)
        sensitivity = _load_json(sensitivity_path)
        injected = _load_json(injected_path)
        persisted_scenario = _load_json(scenario_path)
        recomputed_scenario = audit_transition_scenario(injected)

        if group is None:
            failures.append(f"hardware profile group is missing for {domain}")
        else:
            if group["window"]["retained_samples"] < minimum_hardware_observations:
                failures.append(f"hardware profile has insufficient retained samples for {domain}")
            if group["window"]["estimator_valid"] is not True:
                failures.append(f"hardware profile estimator is invalid for {domain}")
            if group["window"]["dropped_samples"] != 0:
                failures.append(f"hardware profile dropped samples for {domain}")
            if group["clock_semantics"]["cross_clock_subtraction"] is not False:
                failures.append(f"hardware profile uses cross-clock subtraction for {domain}")

        provenance = trace_document.get("provenance", {})
        if provenance.get("source") != "qfabric-stage4-profile":
            failures.append(f"hardware trace provenance is invalid for {domain}")
        if provenance.get("domain") != domain or provenance.get("instrumentation") != "full":
            failures.append(f"hardware trace selector is invalid for {domain}")
        if len(observations) < minimum_hardware_observations:
            failures.append(f"hardware trace has insufficient observations for {domain}")
        if persisted_replay != recomputed_replay:
            failures.append(f"persisted contract replay is not deterministic for {domain}")
        if recomputed_replay["state"] == ContractState.UNKNOWN.value:
            failures.append(f"hardware contract remained UNKNOWN for {domain}")
        if recomputed_replay["claim"] != "empirical-soft-real-time":
            failures.append(f"hardware contract claim is invalid for {domain}")

        configurations = sensitivity.get("configurations", [])
        dimensions = {
            "window_size": {item["window_size"] for item in configurations},
            "violation_windows": {item["violation_windows"] for item in configurations},
            "recovery_windows": {item["recovery_windows"] for item in configurations},
        }
        if sensitivity.get("source_observations") != len(observations):
            failures.append(f"sensitivity source count is invalid for {domain}")
        if sensitivity.get("configuration_count") != len(configurations):
            failures.append(f"sensitivity configuration count is invalid for {domain}")
        if any(len(values) < 2 for values in dimensions.values()):
            failures.append(f"sensitivity does not vary all three dimensions for {domain}")

        injected_provenance = injected.get("provenance", {})
        if (
            injected_provenance.get("injected") is not True
            or injected_provenance.get("research_use")
            != "state-machine-validation-not-hardware-performance"
        ):
            failures.append(f"injected trace is not safely labelled for {domain}")
        if persisted_scenario != recomputed_scenario:
            failures.append(f"scenario audit is not deterministic for {domain}")
        if recomputed_scenario["status"] != "pass":
            failures.append(f"transition scenario failed for {domain}")

        coverage_check = next(
            (
                check
                for check in recomputed_scenario["checks"]
                if check["phase"] == "state-coverage"
            ),
            None,
        )
        required_states = sorted(state.value for state in ContractState)
        if coverage_check is None or coverage_check["observed"] != required_states:
            failures.append(f"transition scenario lacks complete state coverage for {domain}")

        hardware.append(
            {
                "domain": domain,
                "observations": len(observations),
                "complete_windows": len(recomputed_replay["windows"]),
                "final_state": recomputed_replay["state"],
                "sensitivity_configurations": len(configurations),
                "scenario_status": recomputed_scenario["status"],
            }
        )

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 5,
        "claim": "empirical-soft-real-time",
        "status": "pass" if not failures else "fail",
        "minimum_hardware_observations": minimum_hardware_observations,
        "source_root": str(root),
        "hardware": hardware,
        "failures": failures,
    }


def write_stage5_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
