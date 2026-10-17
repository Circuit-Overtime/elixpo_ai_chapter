from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

from .clock_analysis import analyze_clock_alignment
from .io import load_measurements
from .model import Measurement
from .statistics import summarize, summarize_values


def analyze(input_path: Path, json_path: Path, csv_path: Path) -> dict[str, object]:
    groups: dict[tuple[str, int, int, str], list[Measurement]] = defaultdict(list)
    for row in load_measurements(input_path):
        groups[(row.experiment, row.payload_bytes, row.concurrency, row.run_id)].append(row)

    summaries: list[dict[str, object]] = []
    csv_rows: list[dict[str, object]] = []
    for (experiment, payload_bytes, concurrency, run_id), rows in sorted(groups.items()):
        item: dict[str, object] = {
            "experiment": experiment,
            "payload_bytes": payload_bytes,
            "concurrency": concurrency,
            "run_id": run_id,
        }
        item.update(summarize(rows).to_dict())

        csv_item = dict(item)
        batch_elapsed_values = {
            row.batch_elapsed_ns for row in rows if row.batch_elapsed_ns is not None
        }
        if batch_elapsed_values:
            if len(batch_elapsed_values) != 1:
                raise ValueError(f"run {run_id} contains inconsistent concurrent batch timings")
            batch_elapsed_ns = batch_elapsed_values.pop()
            if batch_elapsed_ns <= 0:
                raise ValueError(f"run {run_id} contains an invalid concurrent batch timing")
            successful = sum(row.outcome == "ok" for row in rows)
            concurrent_metrics: dict[str, int | float] = {
                "concurrent_batch_elapsed_ns": batch_elapsed_ns,
                "concurrent_attempts_per_second": len(rows) * 1_000_000_000 / batch_elapsed_ns,
                "concurrent_successes_per_second": successful * 1_000_000_000
                / batch_elapsed_ns,
            }
            item.update(concurrent_metrics)
            csv_item.update(concurrent_metrics)
        diagnostic: tuple[str, str] | None = None
        if experiment == "matrix-update":
            diagnostic = ("mcu_execution", "mcu_execution_us")
        elif experiment == "mcu-linux-roundtrip":
            diagnostic = ("mcu_roundtrip", "mcu_roundtrip_us")

        if experiment == "clock-alignment":
            clock_alignment = analyze_clock_alignment(rows)
            item.update(clock_alignment)
            csv_item.update(clock_alignment)

        if diagnostic is not None:
            csv_prefix, json_name = diagnostic
            execution = summarize_values(
                row.mcu_value for row in rows if row.outcome == "ok" and row.mcu_value is not None
            )
            item[json_name] = execution.to_dict()
            csv_item.update(
                {
                    f"{csv_prefix}_{name}_us" if name != "count" else f"{csv_prefix}_count": value
                    for name, value in execution.to_dict().items()
                }
            )
        summaries.append(item)
        csv_rows.append(csv_item)

    result: dict[str, object] = {"schema_version": 1, "groups": summaries}
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "experiment",
        "payload_bytes",
        "concurrency",
        "run_id",
        "total",
        "count",
        "failures",
        "failure_rate_pct",
        "minimum_ns",
        "p50_ns",
        "p95_ns",
        "p99_ns",
        "maximum_ns",
        "mean_ns",
        "stdev_ns",
        "sequential_calls_per_second",
        "concurrent_batch_elapsed_ns",
        "concurrent_attempts_per_second",
        "concurrent_successes_per_second",
        "clock_alignment_samples",
        "clock_sample_span_ns",
        "clock_mcu_wraps",
        "clock_uncertainty_minimum_ns",
        "clock_uncertainty_p50_ns",
        "clock_uncertainty_p95_ns",
        "clock_uncertainty_p99_ns",
        "clock_uncertainty_maximum_ns",
        "clock_offset_midpoint_start_ns",
        "clock_offset_midpoint_end_ns",
        "clock_drift_regression_ppm",
        "clock_drift_lower_ppm",
        "clock_drift_upper_ppm",
        "clock_endpoint_window_samples",
        "clock_drift_endpoint_span_ns",
        "mcu_execution_count",
        "mcu_execution_minimum_us",
        "mcu_execution_p50_us",
        "mcu_execution_p95_us",
        "mcu_execution_p99_us",
        "mcu_execution_maximum_us",
        "mcu_execution_mean_us",
        "mcu_execution_stdev_us",
        "mcu_roundtrip_count",
        "mcu_roundtrip_minimum_us",
        "mcu_roundtrip_p50_us",
        "mcu_roundtrip_p95_us",
        "mcu_roundtrip_p99_us",
        "mcu_roundtrip_maximum_us",
        "mcu_roundtrip_mean_us",
        "mcu_roundtrip_stdev_us",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(csv_rows)
    return result
