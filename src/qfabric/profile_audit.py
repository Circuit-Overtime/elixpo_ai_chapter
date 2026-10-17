from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .profile_analysis import analyze_profile
from .profiling import load_profile


def audit_stage4(
    overhead_path: Path,
    cold_start_path: Path,
    *,
    metric_tolerance_pct: float = 0.01,
    mean_overhead_limit_pct: float = 5.0,
    p95_overhead_limit_pct: float = 10.0,
) -> dict[str, object]:
    failures: list[str] = []
    overhead_report = load_profile(overhead_path)
    cold_start_report = load_profile(cold_start_path)
    analysis = analyze_profile(overhead_report, tolerance_pct=metric_tolerance_pct)
    if analysis["status"] != "pass":
        failures.extend(analysis["failures"])

    expected_groups = {
        (domain, mode)
        for domain in ("linux", "rt")
        for mode in ("disabled", "reduced", "full")
    }
    observed_groups = {
        (group["domain"], group["instrumentation"])
        for group in overhead_report["groups"]
    }
    if observed_groups != expected_groups:
        failures.append("overhead profile does not contain all six domain/mode groups")

    for group in overhead_report["groups"]:
        label = f"{group['domain']}/{group['instrumentation']}"
        if group["window"]["estimator_valid"] is not True:
            failures.append(f"overhead estimator is invalid for {label}")
        if group["failures"] != 0:
            failures.append(f"profile failures were recorded for {label}")
        if group["deadline"]["misses"] != 0:
            failures.append(f"deadline misses were recorded for {label}")
        if group["window"]["dropped_samples"] != 0:
            failures.append(f"dropped samples were recorded for {label}")
        if group["clock_semantics"]["cross_clock_subtraction"] is not False:
            failures.append(f"cross-clock subtraction is enabled for {label}")
        if group["instrumentation"] == "full":
            if group["metrics_ns"]["local_execution"]["count"] == 0:
                failures.append(f"full local execution metric is missing for {label}")
            if group["metrics_ns"]["communication"]["count"] == 0:
                failures.append(f"full communication metric is missing for {label}")

    overhead_limits: list[dict[str, object]] = []
    for item in analysis["instrumentation_overhead"]:
        mean_passed = abs(item["mean_delta_pct"]) <= mean_overhead_limit_pct
        p95_passed = abs(item["p95_delta_pct"]) <= p95_overhead_limit_pct
        overhead_limits.append(
            {
                **item,
                "mean_limit_pct": mean_overhead_limit_pct,
                "p95_limit_pct": p95_overhead_limit_pct,
                "mean_passed": mean_passed,
                "p95_passed": p95_passed,
            }
        )
        if not mean_passed or not p95_passed:
            failures.append(
                f"instrumentation overhead exceeds its limit for {item['domain']}/{item['mode']}"
            )

    cold_start_checks: list[dict[str, object]] = []
    cold_keys = {
        (group["domain"], group["instrumentation"])
        for group in cold_start_report["groups"]
    }
    if cold_keys != {("linux", "reduced"), ("rt", "reduced")}:
        failures.append("cold-start profile does not contain both reduced-mode domains")
    for group in cold_start_report["groups"]:
        window = group["window"]
        passed = (
            window["estimator_valid"] is False
            and window["invalid_reason"] == "insufficient-samples"
            and window["retained_samples"] < window["minimum_samples"]
        )
        cold_start_checks.append(
            {
                "domain": group["domain"],
                "passed": passed,
                "retained_samples": window["retained_samples"],
                "minimum_samples": window["minimum_samples"],
                "invalid_reason": window["invalid_reason"],
            }
        )
        if not passed:
            failures.append(f"cold-start state is invalid for {group['domain']}")

    return {
        "schema_version": 1,
        "captured_utc": datetime.now(UTC).isoformat(),
        "stage": 4,
        "status": "pass" if not failures else "fail",
        "sources": {
            "overhead": str(overhead_path),
            "cold_start": str(cold_start_path),
        },
        "independent_analysis": analysis,
        "overhead_limits": overhead_limits,
        "cold_start_checks": cold_start_checks,
        "failures": failures,
    }


def write_stage4_audit(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
