#!/usr/bin/env python3
"""Validate and aggregate repeated RV565 benchmark JSON/CSV artifacts."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path
import statistics


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "paper/measurements"
TIMING_FIELDS = ("inflate_us", "scale_us", "dma_wait_us", "lcd_us", "work_us")
T_CRITICAL_95 = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Aggregate complete RV565 benchmark runs into paper statistics."
    )
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--label", default="native-dma-stripes")
    return parser.parse_args()


def percentile(values: list[int], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def distribution(values: list[int]) -> dict[str, float]:
    return {
        "mean": statistics.fmean(values),
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
        "maximum": float(max(values)),
    }


def mean_t_interval(values: list[float]) -> dict[str, float]:
    count = len(values)
    mean = statistics.fmean(values)
    if count < 2:
        raise SystemExit("At least two independent runs are required")
    standard_deviation = statistics.stdev(values)
    degrees_freedom = count - 1
    critical = T_CRITICAL_95.get(degrees_freedom, 1.960)
    half_width = critical * standard_deviation / math.sqrt(count)
    return {
        "count": count,
        "mean": mean,
        "standard_deviation": standard_deviation,
        "confidence": 0.95,
        "method": "two-sided Student-t interval over run-level values",
        "lower": mean - half_width,
        "upper": mean + half_width,
        "minimum": min(values),
        "maximum": max(values),
    }


def artifact_hash(record: dict[str, object], name: str) -> str:
    try:
        value = record["artifacts"][name]["sha256"]
    except (KeyError, TypeError) as exc:
        raise SystemExit(f"Missing {name} artifact hash") from exc
    if not isinstance(value, str) or len(value) != 64:
        raise SystemExit(f"Invalid {name} artifact hash")
    return value


def read_frames(json_path: Path, record: dict[str, object]) -> list[dict[str, int]]:
    csv_name = record.get("frame_csv")
    if not isinstance(csv_name, str):
        raise SystemExit(f"{json_path}: missing frame_csv")
    csv_path = json_path.parent / csv_name
    with csv_path.open(newline="", encoding="utf-8") as source:
        frames = [
            {key: int(value) for key, value in row.items()}
            for row in csv.DictReader(source)
        ]
    expected = int(record["summary"]["frames"])
    if len(frames) != expected:
        raise SystemExit(f"{json_path}: expected {expected} frames, got {len(frames)}")
    if [frame["sequence"] for frame in frames] != list(range(expected)):
        raise SystemExit(f"{json_path}: incomplete frame sequence")
    if sum(frame["skipped"] for frame in frames) != int(record["summary"]["drops"]):
        raise SystemExit(f"{json_path}: drop total disagrees with frame CSV")
    if sum(frame["deadline_missed"] for frame in frames) != int(
        record["summary"]["deadline_misses"]
    ):
        raise SystemExit(f"{json_path}: deadline total disagrees with frame CSV")
    return frames


def heap_entry(record: dict[str, object], phase: str, kind: str) -> dict[str, int]:
    for entry in record["heap"]:
        if entry["phase"] == phase and entry["kind"] == kind:
            return entry
    raise SystemExit(f"Missing heap entry {phase}/{kind}")


def main() -> int:
    args = parse_args()
    paths = sorted({path.expanduser().resolve() for path in args.inputs})
    if len(paths) < 2:
        raise SystemExit("Provide at least two distinct run JSON files")

    records: list[dict[str, object]] = []
    run_paths: list[Path] = []
    all_frames: list[dict[str, int]] = []
    expected_hashes: dict[str, str] | None = None
    expected_metadata: dict[str, object] | None = None
    stable_metadata_keys = (
        "project",
        "idf",
        "elf_sha256",
        "cpu_mhz",
        "spi_khz",
        "source_width",
        "source_height",
        "source_fps",
        "source_frames",
        "container_version",
        "container_bytes",
        "warmup_frames",
        "sample_frames",
    )

    for path in paths:
        record = json.loads(path.read_text(encoding="utf-8"))
        if "aggregate_schema_version" in record:
            continue
        hashes = {
            name: artifact_hash(record, name)
            for name in ("application", "media", "sdkconfig")
        }
        metadata = {key: record["metadata"].get(key) for key in stable_metadata_keys}
        if expected_hashes is None:
            expected_hashes = hashes
            expected_metadata = metadata
        elif hashes != expected_hashes:
            raise SystemExit(f"{path}: artifact hashes differ from the first run")
        elif metadata != expected_metadata:
            raise SystemExit(f"{path}: firmware/media metadata differs from the first run")
        frames = read_frames(path, record)
        records.append(record)
        run_paths.append(path)
        all_frames.extend(frames)

    if len(records) < 2:
        raise SystemExit("Fewer than two run records remained after validation")

    fps_values = [float(record["summary"]["fps"]) for record in records]
    elapsed_values = [float(record["summary"]["elapsed_us"]) for record in records]
    run_work_means = [
        float(record["timing_us"]["work_us"]["mean"]) for record in records
    ]
    run_work_p99 = [
        float(record["timing_us"]["work_us"]["p99"]) for record in records
    ]
    total_drops = sum(int(record["summary"]["drops"]) for record in records)
    total_deadline_misses = sum(
        int(record["summary"]["deadline_misses"]) for record in records
    )

    heap_deltas = []
    for record in records:
        boot = heap_entry(record, "boot", "internal")
        media = heap_entry(record, "media_open", "internal")
        ready = heap_entry(record, "ready", "internal")
        complete = heap_entry(record, "complete", "internal")
        heap_deltas.append(
            {
                "media_state_bytes": boot["free"] - media["free"],
                "instrumentation_and_stripes_bytes": media["free"] - ready["free"],
                "steady_state_drift_bytes": ready["free"] - complete["free"],
                "minimum_free_bytes": complete["min_free"],
            }
        )

    aggregate = {
        "aggregate_schema_version": 1,
        "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "label": args.label,
        "methodology": {
            "independent_runs": len(records),
            "frames_per_run": int(records[0]["summary"]["frames"]),
            "total_frames": len(all_frames),
            "warmup_frames_per_run": int(records[0]["metadata"]["warmup_frames"]),
            "latency_percentiles": "pooled empirical distribution over all frames",
            "run_confidence_intervals": "two-sided 95% Student-t",
        },
        "inputs": [str(path.relative_to(REPO_ROOT)) for path in run_paths],
        "artifacts": expected_hashes,
        "metadata": expected_metadata,
        "container_size_mib": int(records[0]["metadata"]["container_bytes"])
        / (1024 * 1024),
        "fps": mean_t_interval(fps_values),
        "elapsed_us": mean_t_interval(elapsed_values),
        "run_mean_work_us": mean_t_interval(run_work_means),
        "run_p99_work_us": mean_t_interval(run_work_p99),
        "drops": total_drops,
        "deadline_misses": total_deadline_misses,
        "timing_us": {
            field: distribution([frame[field] for frame in all_frames])
            for field in TIMING_FIELDS
        },
        "heap_deltas": heap_deltas,
    }

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"video-benchmark-{args.label}-aggregate-{stamp}.json"
    output_path.write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")

    work = aggregate["timing_us"]["work_us"]
    fps = aggregate["fps"]
    print(f"Validated {len(records)} runs and {len(all_frames)} frames")
    print(f"FPS mean: {fps['mean']:.6f} (95% CI {fps['lower']:.6f}--{fps['upper']:.6f})")
    print(f"Drops: {total_drops}; deadline misses: {total_deadline_misses}")
    print(
        "Work: p50={:.3f} ms p95={:.3f} ms p99={:.3f} ms max={:.3f} ms".format(
            work["p50"] / 1000,
            work["p95"] / 1000,
            work["p99"] / 1000,
            work["maximum"] / 1000,
        )
    )
    print(f"Aggregate: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
