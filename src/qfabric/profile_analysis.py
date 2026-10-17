from __future__ import annotations

import json
import math
import statistics
from pathlib import Path


def _reference_percentile(values: list[int], percentage: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * percentage / 100
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _reference_summary(values: list[int]) -> dict[str, int | float | None]:
    if not values:
        return {
            "count": 0,
            "minimum": None,
            "mean": None,
            "p50": None,
            "p95": None,
            "p99": None,
            "maximum": None,
            "stdev": None,
        }
    return {
        "count": len(values),
        "minimum": min(values),
        "mean": statistics.fmean(values),
        "p50": _reference_percentile(values, 50),
        "p95": _reference_percentile(values, 95),
        "p99": _reference_percentile(values, 99),
        "maximum": max(values),
        "stdev": statistics.pstdev(values),
    }


def _metric_values(samples: list[dict[str, object]], metric: str) -> list[int]:
    successful = [sample for sample in samples if sample["outcome"] == "ok"]
    if metric == "jitter":
        end_to_end = [
            sample["end_to_end_ns"]
            for sample in successful
            if sample["end_to_end_ns"] is not None
        ]
        return [
            abs(current - previous)
            for previous, current in zip(end_to_end, end_to_end[1:], strict=False)
        ]
    field = {
        "end_to_end": "end_to_end_ns",
        "local_execution": "local_execution_ns",
        "communication": "communication_ns",
        "queueing": "queueing_ns",
    }[metric]
    return [sample[field] for sample in successful if sample[field] is not None]


def analyze_profile(report: dict[str, object], *, tolerance_pct: float = 0.01) -> dict[str, object]:
    if tolerance_pct < 0:
        raise ValueError("profile tolerance must not be negative")
    failures: list[str] = []
    verification: list[dict[str, object]] = []
    all_ids: list[int] = []
    groups_by_key: dict[tuple[str, str], dict[str, object]] = {}

    for group in report["groups"]:
        key = (group["domain"], group["instrumentation"])
        groups_by_key[key] = group
        samples = group["samples"]
        all_ids.extend(sample["invocation_id"] for sample in samples)
        for metric, observed in group["metrics_ns"].items():
            reference = _reference_summary(_metric_values(samples, metric))
            metric_failures: list[str] = []
            for field in ("count", "minimum", "mean", "p50", "p95", "p99", "maximum", "stdev"):
                expected_value = reference[field]
                observed_value = observed[field]
                if expected_value is None or observed_value is None:
                    matches = expected_value is observed_value
                elif field == "count":
                    matches = expected_value == observed_value
                else:
                    allowance = max(1.0, abs(float(expected_value)) * tolerance_pct / 100)
                    matches = math.isclose(
                        float(observed_value), float(expected_value), abs_tol=allowance, rel_tol=0
                    )
                if not matches:
                    metric_failures.append(
                        f"{field}: observed={observed_value}, reference={expected_value}"
                    )
            passed = not metric_failures
            verification.append(
                {
                    "domain": group["domain"],
                    "instrumentation": group["instrumentation"],
                    "metric": metric,
                    "passed": passed,
                    "differences": metric_failures,
                }
            )
            if not passed:
                failures.append(
                    f"independent metric mismatch for {group['domain']}/{group['instrumentation']} "
                    f"{metric}"
                )

    ids_unique = len(all_ids) == len(set(all_ids))
    if not ids_unique:
        failures.append("retained invocation IDs are not globally unique")

    overhead: list[dict[str, object]] = []
    for domain in ("linux", "rt"):
        baseline = groups_by_key.get((domain, "disabled"))
        if baseline is None:
            continue
        baseline_mean = baseline["metrics_ns"]["end_to_end"]["mean"]
        baseline_p95 = baseline["metrics_ns"]["end_to_end"]["p95"]
        for mode in ("reduced", "full"):
            candidate = groups_by_key.get((domain, mode))
            if candidate is None:
                continue
            mean = candidate["metrics_ns"]["end_to_end"]["mean"]
            p95 = candidate["metrics_ns"]["end_to_end"]["p95"]
            overhead.append(
                {
                    "domain": domain,
                    "mode": mode,
                    "baseline": "disabled",
                    "mean_delta_ns": mean - baseline_mean,
                    "mean_delta_pct": 100 * (mean / baseline_mean - 1),
                    "p95_delta_ns": p95 - baseline_p95,
                    "p95_delta_pct": 100 * (p95 / baseline_p95 - 1),
                }
            )

    return {
        "schema_version": 1,
        "status": "pass" if not failures else "fail",
        "source_profile_schema_version": report["schema_version"],
        "tolerance_pct": tolerance_pct,
        "retained_invocation_ids": len(all_ids),
        "invocation_ids_unique": ids_unique,
        "metric_verification": verification,
        "instrumentation_overhead": overhead,
        "failures": failures,
    }


def write_profile_analysis(analysis: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(analysis, indent=2, sort_keys=True) + "\n", encoding="utf-8")
