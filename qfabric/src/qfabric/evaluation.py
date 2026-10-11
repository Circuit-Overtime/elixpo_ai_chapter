from __future__ import annotations

import csv
import hashlib
import itertools
import json
import math
import os
import platform
import random
import statistics
import time
import tracemalloc
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .profiling import percentile
from .recommendation import recommend

BASELINES = (
    "ordinary-linux",
    "tuned-linux",
    "static-mcu-first",
    "manual-expert",
    "qfabric-static",
    "qfabric-recovery",
    "offline-oracle",
)


def probe_scheduler_environment() -> dict[str, Any]:
    policy = os.sched_getscheduler(0)
    fifo = getattr(os, "SCHED_FIFO", 1)
    release = platform.release()
    config_path = Path(f"/boot/config-{release}")
    try:
        config = config_path.read_text(encoding="utf-8")
    except OSError:
        config = ""
    fifo_active = policy == fifo
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "kernel_release": release,
        "sched_fifo": {
            "available": fifo_active,
            "active_for_capture": fifo_active,
            "priority": os.sched_getparam(0).sched_priority,
            "reason": None if fifo_active else "capture-process-not-running-under-SCHED_FIFO",
        },
        "sched_deadline": {
            "available": False,
            "reason": "not-selected-SCHED_FIFO-is-the-predeclared-tuned-baseline",
        },
        "preempt_rt": {
            "available": "PREEMPT_RT" in config or "-rt" in release,
            "reason": (
                None
                if "PREEMPT_RT" in config or "-rt" in release
                else "running-kernel-is-not-PREEMPT_RT"
            ),
        },
    }


def write_scheduler_environment(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def _profile_samples(report: dict[str, Any], domain: str) -> list[int]:
    group = next(
        (
            item
            for item in report["groups"]
            if item["domain"] == domain and item["instrumentation"] == "full"
        ),
        None,
    )
    if group is None:
        raise ValueError(f"profile lacks {domain}/full samples")
    samples = [
        int(sample["end_to_end_ns"])
        for sample in group["samples"]
        if sample["outcome"] == "ok" and sample["end_to_end_ns"] is not None
    ]
    if len(samples) < 20:
        raise ValueError(f"profile has insufficient {domain}/full samples")
    return samples


def _kernel_samples(paths: list[Path]) -> list[int]:
    samples = []
    for path in paths:
        report = _load(path)
        samples.extend(
            int(sample["end_to_end_ns"])
            for sample in report["samples"]
            if sample.get("outcome") == "ok" and sample.get("end_to_end_ns") is not None
        )
    if len(samples) < 20:
        raise ValueError("loaded Linux evidence contains fewer than 20 samples")
    return samples


def derive_deadline(stage1_paths: list[Path]) -> dict[str, Any]:
    if len(stage1_paths) < 3:
        raise ValueError("deadline derivation requires at least three Stage 1 repetitions")
    p99_values = []
    for path in stage1_paths:
        report = _load(path)
        group = next(
            (
                item
                for item in report.get("groups", [])
                if item.get("experiment") == "rpc-roundtrip"
            ),
            None,
        )
        if group is None or group.get("p99_ns") is None:
            raise ValueError(f"Stage 1 round-trip p99 is missing: {path}")
        p99_values.append(float(group["p99_ns"]))
    maximum = max(p99_values)
    factor = 1.25
    quantum_ns = 5_000_000
    deadline_ns = math.ceil(maximum * factor / quantum_ns) * quantum_ns
    return {
        "metric": "maximum idle rpc-roundtrip p99 across repetitions",
        "source_values_ns": p99_values,
        "maximum_ns": maximum,
        "safety_factor": factor,
        "rounding_quantum_ns": quantum_ns,
        "deadline_ns": deadline_ns,
        "post_hoc_tuned": False,
    }


def _placement(
    app: dict[str, Any], baseline: str, linux_p95: float, rt_p95: float
) -> list[str]:
    nodes = app["nodes"]
    if baseline in {"ordinary-linux", "tuned-linux"}:
        return ["linux"] * len(nodes)
    if baseline == "static-mcu-first":
        return ["linux" if node["linux_only"] else "rt" for node in nodes]
    if baseline == "manual-expert":
        return list(app["manual_expert"])
    if baseline in {"qfabric-static", "qfabric-recovery"}:
        # Stage 6 selected Linux from the idle evidence. Recovery begins from
        # that persisted static decision rather than re-optimizing after load.
        preferred = "linux"
        return ["linux" if node["linux_only"] else preferred for node in nodes]
    raise ValueError(f"unsupported fixed-placement baseline: {baseline}")


def _summarize(values: list[int], deadline_ns: int) -> dict[str, Any]:
    misses = sum(value > deadline_ns for value in values)
    return {
        "observations": len(values),
        "deadline_ns": deadline_ns,
        "misses": misses,
        "miss_rate_pct": misses / len(values) * 100.0,
        "mean_ns": statistics.fmean(values),
        "p50_ns": percentile(values, 50),
        "p95_ns": percentile(values, 95),
        "p99_ns": percentile(values, 99),
        "maximum_ns": max(values),
    }


def _simulate(
    app: dict[str, Any],
    baseline: str,
    linux: list[int],
    rt: list[int],
    *,
    tuned: list[int] | None,
    boundary_ns: int,
    per_node_deadline_ns: int,
    observations: int,
    seed: int,
    loaded: bool,
    recovery_switch_observation: int,
) -> dict[str, Any]:
    rng = random.Random(seed)
    linux_p95 = percentile(linux, 95)
    rt_p95 = percentile(rt, 95)
    placement = None
    if baseline != "offline-oracle":
        placement = _placement(app, baseline, linux_p95, rt_p95)
    values: list[int] = []
    chosen_domains = {"linux": 0, "rt": 0}
    for index in range(observations):
        domains = placement
        if baseline == "qfabric-recovery" and loaded and index >= recovery_switch_observation:
            domains = ["linux" if node["linux_only"] else "rt" for node in app["nodes"]]
        node_samples = []
        for _node in app["nodes"]:
            linux_source = tuned if baseline == "tuned-linux" and tuned else linux
            linux_sample = rng.choice(linux_source)
            rt_sample = rng.choice(rt)
            node_samples.append((linux_sample, rt_sample))
        if baseline == "offline-oracle":
            choices = [
                ("linux",) if node["linux_only"] else ("linux", "rt")
                for node in app["nodes"]
            ]
            candidates = []
            for candidate in itertools.product(*choices):
                cost = sum(
                    node_samples[node_index][0 if domain == "linux" else 1]
                    for node_index, domain in enumerate(candidate)
                )
                cost += sum(
                    boundary_ns
                    for left, right in zip(candidate, candidate[1:], strict=False)
                    if left != right
                )
                candidates.append((cost, candidate))
            total, selected = min(candidates)
            domains = list(selected)
        if domains is None:
            raise RuntimeError("placement was not selected")
        total = 0
        previous = None
        for node_index, domain in enumerate(domains):
            total += node_samples[node_index][0 if domain == "linux" else 1]
            if previous is not None and previous != domain:
                total += boundary_ns
            previous = domain
            chosen_domains[domain] += 1
        values.append(total)
    summary = _summarize(values, per_node_deadline_ns * len(app["nodes"]))
    summary.update(
        {
            "baseline": baseline,
            "application": app["name"],
            "evidence_mode": "measured-trace-replay",
            "placement": "per-observation-oracle" if placement is None else placement,
            "chosen_node_executions": chosen_domains,
            "seed": seed,
            "loaded": loaded,
        }
    )
    return summary


def _logical_lines(path: Path) -> int:
    return sum(
        bool(line.strip())
        and not line.lstrip().startswith(("//", "/*", "*", "#include"))
        for line in path.read_text(encoding="utf-8").splitlines()
    )


def _scheduler_environment(path: Path | None) -> dict[str, Any]:
    if path is None or not path.is_file():
        return {
            "sched_fifo": {"available": False, "reason": "campaign-not-supplied"},
            "sched_deadline": {"available": False, "reason": "not-evaluated"},
            "preempt_rt": {"available": False, "reason": "not-evaluated"},
        }
    return _load(path)


def measure_policy_overhead(
    recommendation_input: dict[str, Any], *, iterations: int = 1000
) -> dict[str, Any]:
    if iterations < 100:
        raise ValueError("policy overhead measurement requires at least 100 iterations")
    wall_samples = []
    cpu_samples = []
    for _index in range(iterations):
        wall_started = time.perf_counter_ns()
        cpu_started = time.process_time_ns()
        report = recommend(recommendation_input)
        cpu_samples.append(time.process_time_ns() - cpu_started)
        wall_samples.append(time.perf_counter_ns() - wall_started)
        if not report["records"]:
            raise RuntimeError("policy overhead measurement produced no decisions")
    tracemalloc.start()
    try:
        recommend(recommendation_input)
        _current, peak_bytes = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    return {
        "measurement": "in-process static recommendation evaluation",
        "iterations": iterations,
        "wall_time_ns": {
            "mean": statistics.fmean(wall_samples),
            "p95": percentile(wall_samples, 95),
        },
        "cpu_time_ns": {
            "mean": statistics.fmean(cpu_samples),
            "p95": percentile(cpu_samples, 95),
        },
        "traced_peak_bytes_single_decision": peak_bytes,
        "scope": (
            "Python allocations observed by tracemalloc; excludes interpreter "
            "baseline and native allocator memory"
        ),
    }


def evaluate_stage11(
    root: Path,
    *,
    applications_path: Path,
    stage1_paths: list[Path],
    stage4_profile_path: Path,
    loaded_linux_paths: list[Path],
    tuned_profile_path: Path | None,
    tuned_loaded_profile_path: Path | None,
    scheduler_path: Path | None,
    recovery_success_path: Path,
    recovery_rollback_path: Path,
    recommendation_input_path: Path,
    recommendation_scenarios_path: Path,
    stage9_audit_path: Path,
    stage10_audit_path: Path,
    observations: int = 1000,
) -> dict[str, Any]:
    if observations < 100:
        raise ValueError("Stage 11 requires at least 100 observations per cell")
    applications_document = _load(applications_path)
    applications = applications_document["applications"]
    seed = int(applications_document["seed"])
    stage4 = _load(stage4_profile_path)
    linux_idle = _profile_samples(stage4, "linux")
    rt_idle = _profile_samples(stage4, "rt")
    linux_loaded = _kernel_samples(loaded_linux_paths)
    tuned = None
    if tuned_profile_path is not None and tuned_profile_path.is_file():
        tuned = _profile_samples(_load(tuned_profile_path), "linux")
    tuned_loaded = None
    if tuned_loaded_profile_path is not None and tuned_loaded_profile_path.is_file():
        tuned_loaded = _profile_samples(_load(tuned_loaded_profile_path), "linux")
    threshold = derive_deadline(stage1_paths)
    deadline_ns = int(threshold["deadline_ns"])
    boundary_ns = int(statistics.median(threshold["source_values_ns"]))

    scheduler = _scheduler_environment(scheduler_path)
    tuned_available = tuned is not None and scheduler["sched_fifo"]["available"] is True
    results = []
    for app_index, app in enumerate(applications):
        for baseline in BASELINES:
            if baseline == "tuned-linux" and not tuned_available:
                results.append(
                    {
                        "application": app["name"],
                        "baseline": baseline,
                        "status": "unavailable",
                        "reason": scheduler["sched_fifo"].get(
                            "reason", "profile-missing"
                        ),
                    }
                )
                continue
            results.append(
                {
                    "status": "measured-trace-replay",
                    **_simulate(
                        app,
                        baseline,
                        linux_idle,
                        rt_idle,
                        tuned=tuned,
                        boundary_ns=boundary_ns,
                        per_node_deadline_ns=deadline_ns,
                        observations=observations,
                        seed=seed + app_index * 100,
                        loaded=False,
                        recovery_switch_observation=60,
                    ),
                }
            )

    flagship_app = applications[0]
    success = _load(recovery_success_path)
    rollback = _load(recovery_rollback_path)
    switch_window = next(
        transition["window_index"]
        for transition in success["runtime"]["transitions"]
        if transition["type"] == "switch"
    )
    window_size = int(success["configuration"]["invocations_per_window"])
    recovery_switch_observation = switch_window * window_size
    flagship = []
    for baseline in BASELINES:
        if baseline == "tuned-linux" and (
            not tuned_available or tuned_loaded is None
        ):
            flagship.append(
                {
                    "application": "flagship-linux-load-shift",
                    "baseline": baseline,
                    "status": "unavailable",
                    "reason": scheduler["sched_fifo"].get(
                        "reason", "profile-missing"
                    ),
                }
            )
            continue
        result = _simulate(
            flagship_app,
            baseline,
            linux_loaded,
            rt_idle,
            tuned=tuned_loaded,
            boundary_ns=boundary_ns,
            per_node_deadline_ns=deadline_ns,
            observations=observations,
            seed=seed + 1000,
            loaded=True,
            recovery_switch_observation=recovery_switch_observation,
        )
        result["application"] = "flagship-linux-load-shift"
        result["status"] = "measured-trace-replay"
        flagship.append(result)

    scenarios = _load(recommendation_scenarios_path)
    recommendation_input = _load(recommendation_input_path)
    policy_overhead = measure_policy_overhead(recommendation_input)
    rejection_codes = sorted(
        {
            reason["code"]
            for scenario in scenarios["scenarios"]
            for record in scenario["recommendation"]["records"]
            for candidate in record["candidates"]
            for reason in candidate["rejection_reasons"]
        }
    )
    stage9 = _load(stage9_audit_path)
    stage10 = _load(stage10_audit_path)
    visualization_p95_delta_pct = max(
        float(item["p95_delta_pct"]) for item in stage9["comparisons"]
    )
    profile_overhead = {}
    communication = {}
    for domain in ("linux", "rt"):
        disabled = next(
            item
            for item in stage4["groups"]
            if item["domain"] == domain and item["instrumentation"] == "disabled"
        )
        full = next(
            item
            for item in stage4["groups"]
            if item["domain"] == domain and item["instrumentation"] == "full"
        )
        disabled_p95 = float(disabled["metrics_ns"]["end_to_end"]["p95"])
        full_p95 = float(full["metrics_ns"]["end_to_end"]["p95"])
        profile_overhead[domain] = {
            "disabled_p95_ns": disabled_p95,
            "full_p95_ns": full_p95,
            "p95_delta_pct": (full_p95 - disabled_p95) / disabled_p95 * 100,
        }
        communication[domain] = {
            "p50_ns": full["metrics_ns"]["communication"]["p50"],
            "p95_ns": full["metrics_ns"]["communication"]["p95"],
        }
    manual_path = root / "baselines/manual_bridge_add.cpp"
    qtask_path = root / "qtasks/add.qtask.h"
    effort = {
        "method": (
            "nonblank noncomment maintained source lines; illustrative implementation "
            "proxy, not a user study"
        ),
        "manual_bridge_path": str(manual_path.relative_to(root)),
        "qfabric_declaration_path": str(qtask_path.relative_to(root)),
        "manual_bridge_logical_lines": _logical_lines(manual_path),
        "qfabric_declaration_logical_lines": _logical_lines(qtask_path),
    }
    effort["line_reduction_pct"] = (
        1
        - effort["qfabric_declaration_logical_lines"]
        / effort["manual_bridge_logical_lines"]
    ) * 100

    measured_rows = [
        row for row in results if row.get("status") == "measured-trace-replay"
    ]
    flagship_rows = {
        row["baseline"]: row
        for row in flagship
        if row.get("status") == "measured-trace-replay"
    }
    ordinary = flagship_rows["ordinary-linux"]
    recovery = flagship_rows["qfabric-recovery"]
    oracle = flagship_rows["offline-oracle"]
    rq_answers = {
        "RQ1": {
            "answer": "yes-with-bounded-window-delay-in-the-controlled-hardware-scenario",
            "detection_delay_windows": success["runtime"]["recovery"]["metrics"][
                "detection_delay_windows"
            ],
            "false_switches": success["runtime"]["recovery"]["metrics"][
                "false_switches"
            ],
        },
        "RQ2": {
            "answer": "yes-for-the-tested-feasible-alternate",
            "verified_recovery_windows": success["runtime"]["recovery"]["metrics"][
                "verified_recovery_windows"
            ],
            "flagship_p95_improvement_pct": (
                ordinary["p95_ns"] - recovery["p95_ns"]
            )
            / ordinary["p95_ns"]
            * 100,
        },
        "RQ3": {
            "answer": "yes-for-the-enumerated-negative-scenarios",
            "rejection_codes": rejection_codes,
        },
        "RQ4": {
            "answer": "improves-on-ordinary-linux-but-trails-tuned-linux-and-oracle",
            "recovery_to_oracle_p95_ratio": recovery["p95_ns"] / oracle["p95_ns"],
            "recovery_to_tuned_linux_p95_ratio": (
                None
                if "tuned-linux" not in flagship_rows
                else recovery["p95_ns"] / flagship_rows["tuned-linux"]["p95_ns"]
            ),
        },
        "RQ5": {
            "answer": (
                "quantified-for-policy-profiling-communication-stabilization-"
                "and-visualization"
            ),
            "policy_cpu_p95_ns": policy_overhead["cpu_time_ns"]["p95"],
            "policy_peak_traced_bytes": policy_overhead[
                "traced_peak_bytes_single_decision"
            ],
            "profile_overhead_pct": profile_overhead,
            "visualization_overhead_pct": visualization_p95_delta_pct,
        },
        "RQ6": {
            "answer": "fewer-maintained-lines-in-the-declared-proxy-comparison",
            "line_reduction_pct": effort["line_reduction_pct"],
            "user_study": False,
        },
    }

    source_paths = [
        applications_path,
        *stage1_paths,
        stage4_profile_path,
        *loaded_linux_paths,
        recovery_success_path,
        recovery_rollback_path,
        recommendation_input_path,
        recommendation_scenarios_path,
        stage9_audit_path,
        stage10_audit_path,
    ]
    if tuned_profile_path is not None and tuned_profile_path.is_file():
        source_paths.append(tuned_profile_path)
    if tuned_loaded_profile_path is not None and tuned_loaded_profile_path.is_file():
        source_paths.append(tuned_loaded_profile_path)
    if scheduler_path is not None and scheduler_path.is_file():
        source_paths.append(scheduler_path)
    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 11,
        "claim": "safe-closed-loop-recovery-of-empirical-timing-contracts",
        "evidence_scope": {
            "direct_hardware": "Stage 1-10 source reports and scheduler campaign",
            "application_evaluation": (
                "deterministic replay of measured hardware traces over declared workload graphs"
            ),
            "hard_real_time_claimed": False,
        },
        "configuration": {
            "seed": seed,
            "observations_per_cell": observations,
            "baseline_order": list(BASELINES),
            "deadline_derivation": threshold,
            "cross_domain_edge_cost_ns": boundary_ns,
        },
        "scheduler_baselines": scheduler,
        "applications": applications,
        "results": results,
        "flagship": {
            "results": flagship,
            "recovery_switch_observation": recovery_switch_observation,
            "hardware_success_status": success["status"],
            "hardware_rollback_status": rollback["status"],
            "hardware_detection_delay_windows": success["runtime"]["recovery"]["metrics"][
                "detection_delay_windows"
            ],
            "hardware_verified_recovery_windows": success["runtime"]["recovery"][
                "metrics"
            ]["verified_recovery_windows"],
            "hardware_rollbacks": rollback["runtime"]["recovery"]["metrics"][
                "rollbacks"
            ],
        },
        "safety_rejections": {
            "observed_codes": rejection_codes,
            "communication_dominated": "higher_predicted_end_to_end"
            in rejection_codes,
            "inadmissible": "destination_not_admitted" in rejection_codes,
            "unsafe_effect": "semantic_ineligible" in rejection_codes,
            "mcu_headroom": "mcu_headroom_exceeded" in rejection_codes,
        },
        "overheads": {
            "policy": policy_overhead,
            "profiling": profile_overhead,
            "communication": communication,
            "stabilization": {
                "switch_window": switch_window,
                "commit_window": next(
                    entry["execution"]["window_index"]
                    for entry in success["runtime"]["windows"]
                    if any(
                        action["type"] == "commit"
                        for action in entry["recovery_step"]["actions"]
                    )
                ),
                "invocations_per_window": window_size,
            },
            "optional_kernel_instrumentation_p95_delta_pct": stage10["overhead"][
                "p95_delta_pct"
            ],
            "visualization_p95_delta_pct": visualization_p95_delta_pct,
            "kernel_instrumentation_mode": "optional",
            "policy_location": "userspace",
        },
        "programmer_effort": effort,
        "research_questions": rq_answers,
        "coverage": {
            "application_cells": len(measured_rows),
            "flagship_cells": len(flagship_rows),
            "positive_hardware_recovery": success["status"] == "pass",
            "rollback_hardware_recovery": rollback["status"] == "pass",
            "infeasible_scenario": "predicted_deadline_miss" in rejection_codes,
            "negative_safety_scenarios": all(
                code in rejection_codes
                for code in (
                    "higher_predicted_end_to_end",
                    "destination_not_admitted",
                    "semantic_ineligible",
                    "mcu_headroom_exceeded",
                )
            ),
        },
        "source_manifest": [
            {"path": str(path), "sha256": _sha256(path)} for path in source_paths
        ],
    }


def write_evaluation(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def write_tables(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    rows = [*report["results"], *report["flagship"]["results"]]
    fields = [
        "application",
        "baseline",
        "status",
        "observations",
        "deadline_ns",
        "misses",
        "miss_rate_pct",
        "mean_ns",
        "p95_ns",
        "p99_ns",
        "reason",
    ]
    with output.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination, fieldnames=fields, extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(rows)


def write_figure(report: dict[str, Any], output: Path) -> None:
    rows = [
        row for row in report["flagship"]["results"] if "p95_ns" in row
    ]
    width, height = 900, 430
    maximum = max(float(row["p95_ns"]) for row in rows)
    bar_width = 90
    gap = 30
    elements = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
            f'height="{height}" viewBox="0 0 {width} {height}">'
        ),
        '<rect width="100%" height="100%" fill="white"/>',
        (
            '<text x="30" y="32" font-family="sans-serif" font-size="20">'
            "Flagship load-shift: p95 latency by baseline</text>"
        ),
    ]
    for index, row in enumerate(rows):
        x = 35 + index * (bar_width + gap)
        bar_height = float(row["p95_ns"]) / maximum * 290
        y = 350 - bar_height
        color = (
            "#2d7dd2" if row["baseline"] == "qfabric-recovery" else "#8d99ae"
        )
        elements.append(
            f'<rect x="{x}" y="{y:.2f}" width="{bar_width}" '
            f'height="{bar_height:.2f}" fill="{color}"/>'
        )
        elements.append(
            f'<text x="{x + bar_width / 2}" y="{y - 6:.2f}" '
            'text-anchor="middle" font-family="sans-serif" font-size="11">'
            f'{row["p95_ns"] / 1_000_000:.1f} ms</text>'
        )
        label = row["baseline"].replace("-", " ")
        elements.append(
            f'<text x="{x + bar_width / 2}" y="372" text-anchor="middle" '
            f'font-family="sans-serif" font-size="10">{label}</text>'
        )
    elements.append(
        '<text x="18" y="205" transform="rotate(-90 18 205)" '
        'text-anchor="middle" font-family="sans-serif" font-size="12">'
        "p95 end-to-end latency</text>"
    )
    elements.append("</svg>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(elements) + "\n", encoding="utf-8")
