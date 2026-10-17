from __future__ import annotations

import json
import statistics
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _median_metric(reports: list[dict[str, Any]], metric: str, field: str) -> float:
    values = [report["metrics"][metric][field] for report in reports]
    if any(value is None for value in values):
        raise ValueError(f"missing {metric}.{field} benchmark metric")
    return float(statistics.median(values))


def audit_stage10(
    capabilities_path: Path,
    stage4_profile_path: Path,
    baseline_paths: list[Path],
    perf_paths: list[Path],
    loaded_perf_paths: list[Path],
    accuracy_path: Path,
    fallback_path: Path,
    *,
    maximum_p95_overhead_pct: float = 15.0,
) -> dict[str, object]:
    if not baseline_paths or len(baseline_paths) != len(perf_paths):
        raise ValueError("baseline and perf reports must be non-empty and paired")
    capabilities = _load(capabilities_path)
    stage4 = _load(stage4_profile_path)
    baseline = [_load(path) for path in baseline_paths]
    perf = [_load(path) for path in perf_paths]
    loaded_perf = [_load(path) for path in loaded_perf_paths]
    accuracy = _load(accuracy_path)
    fallback = _load(fallback_path)
    failures: list[str] = []

    selected_perf = (
        capabilities.get("selection", {}).get("mechanism")
        == "perf_event_open-software-counters"
        and capabilities.get("selection", {}).get("perf_available") is True
    )
    if not selected_perf:
        failures.append("standard perf software counters were not selected and available")
    privileged_scheduler_events = (
        capabilities.get("selection", {}).get("kernel_inclusive_scheduler_events") is True
        and capabilities.get("selection", {}).get("scheduler_event_privilege")
        == "root-or-CAP_PERFMON"
    )
    if not privileged_scheduler_events:
        failures.append("kernel scheduler-event privilege was not available and declared")
    no_custom_module = (
        capabilities.get("selection", {}).get("custom_kernel_module") == "not-introduced"
    )
    if not no_custom_module:
        failures.append("custom kernel module boundary was violated")
    policy_userspace = all(
        report.get("policy_location") == "userspace"
        for report in baseline + perf + loaded_perf + [accuracy, fallback]
    )
    if not policy_userspace:
        failures.append("one or more reports moved policy outside userspace")

    reports_valid = all(
        report.get("status") == "pass"
        and report.get("failures") == 0
        and report.get("successful_samples") == report["configuration"]["iterations"]
        for report in baseline + perf + loaded_perf + [accuracy, fallback]
    )
    if not reports_valid:
        failures.append("one or more kernel instrumentation reports are incomplete")
    if any(report.get("mode") != "userspace-baseline" for report in baseline):
        failures.append("baseline reports did not use the userspace-only path")
    if any(report.get("mode") != "perf" for report in perf):
        failures.append("instrumented reports did not use perf")
    if not loaded_perf or any(report.get("mode") != "perf" for report in loaded_perf):
        failures.append("CPU-loaded perf reports are missing or invalid")
    if accuracy.get("mode") != "perf":
        failures.append("known-delay accuracy report did not use perf")

    fallback_safe = (
        fallback.get("mode") == "userspace-fallback"
        and fallback.get("perf_error") == "forced-unavailable"
        and fallback.get("status") == "pass"
    )
    if not fallback_safe:
        failures.append("forced instrumentation failure did not degrade safely")

    perf_samples = [sample for report in perf for sample in report["samples"]]
    attribution_complete = bool(perf_samples) and all(
        sample["task_clock_ns"] is not None
        and sample["task_clock_ns"] > 0
        and sample["non_cpu_ns"] is not None
        and sample["end_to_end_ns"]
        == sample["task_clock_ns"] + sample["non_cpu_ns"]
        and sample["context_switches"] is not None
        and sample["cpu_migrations"] is not None
        for sample in perf_samples
    )
    if not attribution_complete:
        failures.append("perf samples do not provide a complete timing decomposition")

    loaded_samples = [sample for report in loaded_perf for sample in report["samples"]]
    scheduler_events_observed = bool(loaded_samples) and all(
        sample["context_switches"] is not None and sample["cpu_migrations"] is not None
        for sample in loaded_samples
    ) and any(sample["context_switches"] > 0 for sample in loaded_samples)
    if not scheduler_events_observed:
        failures.append("CPU-loaded campaign did not observe scheduler context switches")

    baseline_p95 = _median_metric(baseline, "end_to_end_ns", "p95")
    perf_p95 = _median_metric(perf, "end_to_end_ns", "p95")
    p95_overhead_pct = (perf_p95 - baseline_p95) / baseline_p95 * 100.0
    overhead_within_budget = p95_overhead_pct <= maximum_p95_overhead_pct
    if not overhead_within_budget:
        failures.append("perf instrumentation p95 overhead exceeded its budget")

    injected_delay_ns = accuracy["configuration"].get("injected_delay_ns", 0)
    baseline_non_cpu_p50 = _median_metric(perf, "non_cpu_ns", "p50")
    accuracy_non_cpu_p50 = float(accuracy["metrics"]["non_cpu_ns"]["p50"])
    observed_delay_ns = accuracy_non_cpu_p50 - baseline_non_cpu_p50
    accuracy_error_ns = observed_delay_ns - injected_delay_ns
    accuracy_within_tolerance = (
        injected_delay_ns > 0 and abs(accuracy_error_ns) <= 1_000_000
    )
    if not accuracy_within_tolerance:
        failures.append("known-delay non-CPU attribution exceeded 1 ms error")

    stage4_group = next(
        (
            group
            for group in stage4["groups"]
            if group["task"] == "add"
            and group["domain"] == "linux"
            and group["instrumentation"] == "full"
        ),
        None,
    )
    if stage4_group is None:
        raise ValueError("Stage 4 profile lacks the Linux/full reference group")
    adjacent_timestamp_p95 = stage4_group["metrics_ns"]["queueing"]["p95"]
    non_cpu_p95 = _median_metric(perf, "non_cpu_ns", "p95")
    gap_quantified = (
        adjacent_timestamp_p95 is not None
        and adjacent_timestamp_p95 > 0
        and non_cpu_p95 > adjacent_timestamp_p95 * 100
    )
    if not gap_quantified:
        failures.append("the Stage 4 queueing measurement deficiency was not quantified")

    unavailable_honest = (
        capabilities["selection"]["wake_up_latency"]
        == "unavailable-with-stock-kernel"
        and capabilities["selection"]["cpu_pressure"]
        == "unavailable-CONFIG_PSI-disabled"
        and capabilities["selection"]["ebpf"]
        == "not-justified-no-scheduler-tracepoints-or-BTF"
    )
    if not unavailable_honest:
        failures.append("unavailable stock-kernel measurements are not declared explicitly")

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 10,
        "status": "pass" if not failures else "fail",
        "sources": {
            "capabilities": str(capabilities_path),
            "stage4_profile": str(stage4_profile_path),
            "baseline": [str(path) for path in baseline_paths],
            "perf": [str(path) for path in perf_paths],
            "loaded_perf": [str(path) for path in loaded_perf_paths],
            "accuracy": str(accuracy_path),
            "fallback": str(fallback_path),
        },
        "measurement_gap": {
            "stage4_adjacent_timestamp_queueing_p95_ns": adjacent_timestamp_p95,
            "perf_non_cpu_median_p95_ns": non_cpu_p95,
            "ratio": (
                None
                if adjacent_timestamp_p95 in {None, 0}
                else non_cpu_p95 / adjacent_timestamp_p95
            ),
        },
        "overhead": {
            "repetitions": len(baseline),
            "baseline_median_p95_ns": baseline_p95,
            "perf_median_p95_ns": perf_p95,
            "p95_delta_pct": p95_overhead_pct,
            "budget_pct": maximum_p95_overhead_pct,
        },
        "accuracy": {
            "injected_delay_ns": injected_delay_ns,
            "baseline_non_cpu_median_p50_ns": baseline_non_cpu_p50,
            "injected_non_cpu_p50_ns": accuracy_non_cpu_p50,
            "observed_delay_ns": observed_delay_ns,
            "error_ns": accuracy_error_ns,
            "absolute_tolerance_ns": 1_000_000,
        },
        "checks": {
            "measured_deficiency_addressed": gap_quantified,
            "existing_kernel_interface_selected": selected_perf,
            "scheduler_event_privilege_declared": privileged_scheduler_events,
            "before_after_reports_valid": reports_valid,
            "attribution_complete": attribution_complete,
            "scheduler_events_observed_under_load": scheduler_events_observed,
            "overhead_within_budget": overhead_within_budget,
            "known_delay_accuracy_within_tolerance": accuracy_within_tolerance,
            "userspace_fallback_safe": fallback_safe,
            "policy_remains_userspace": policy_userspace,
            "unavailable_metrics_declared": unavailable_honest,
            "no_custom_kernel_module": no_custom_module,
        },
        "failures": failures,
    }


def write_stage10_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
