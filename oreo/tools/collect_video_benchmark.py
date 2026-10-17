#!/usr/bin/env python3
"""Capture and summarise one instrumented RV565 benchmark run."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time

try:
    import serial
except ImportError as exc:
    raise SystemExit(
        "pyserial is required; run this script with the repository .venv Python"
    ) from exc


REPO_ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_DIR = REPO_ROOT / "experiments/video_dma"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "paper/measurements"
FRAME_COLUMNS = (
    "sequence",
    "source_frame",
    "inflate_us",
    "scale_us",
    "dma_wait_us",
    "lcd_us",
    "work_us",
    "skipped",
    "deadline_missed",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture a fixed-window RV565 serial benchmark and compute percentiles."
    )
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--label", default="native-dma-stripes")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="do not pulse the USB-UART reset line after opening the port",
    )
    parser.add_argument(
        "--verbose-frames",
        action="store_true",
        help="print all per-frame records instead of compact progress",
    )
    return parser.parse_args()


def parse_key_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in text.split(","):
        key, separator, value = item.partition("=")
        if separator:
            values[key] = value
    return values


def number(value: str) -> int | float | str:
    try:
        return int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value


def percentile(values: list[int], fraction: float) -> float:
    if not values:
        raise ValueError("cannot calculate a percentile of an empty sample")
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def sha256(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_metadata() -> dict[str, object]:
    revision = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    status = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    diff = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "diff", "--binary", "HEAD"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return {
        "revision": revision.stdout.strip() if revision.returncode == 0 else None,
        "dirty": bool(status.stdout.strip()) if status.returncode == 0 else None,
        "tracked_diff_sha256": (
            hashlib.sha256(diff.stdout).hexdigest() if diff.returncode == 0 else None
        ),
    }


def reset_application(connection: serial.Serial) -> None:
    # Standard ESP32 DevKit auto-reset circuit: keep GPIO0 high while pulsing EN.
    connection.dtr = False
    connection.rts = True
    time.sleep(0.12)
    connection.rts = False
    time.sleep(0.25)
    connection.reset_input_buffer()


def capture(args: argparse.Namespace) -> list[str]:
    print(f"Opening {args.port} at {args.baud} baud ...", flush=True)
    lines: list[str] = []
    deadline = time.monotonic() + args.timeout
    frame_records = 0
    with serial.Serial(args.port, args.baud, timeout=0.25) as connection:
        if not args.no_reset:
            reset_application(connection)
        print("Waiting for RV565 benchmark output ...", flush=True)
        while time.monotonic() < deadline:
            raw = connection.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            lines.append(line)
            if line.startswith("RV565_FRAME,"):
                frame_records += 1
                if args.verbose_frames:
                    print(line, flush=True)
                elif frame_records % 120 == 0:
                    print(f"Captured {frame_records} frame records ...", flush=True)
            elif line.startswith("RV565_"):
                print(line, flush=True)
            if line == "RV565_END":
                return lines
    raise SystemExit(
        "Timed out before RV565_END. Verify the instrumented benchmark is "
        "flashed and that this is the USB-UART console port."
    )


def parse_capture(lines: list[str]) -> dict[str, object]:
    metadata: dict[str, object] = {}
    heaps: list[dict[str, object]] = []
    summary: dict[str, object] | None = None
    frames: list[dict[str, int]] = []

    for line in lines:
        if line.startswith("RV565_META,"):
            key, separator, value = line[len("RV565_META,") :].partition("=")
            if separator:
                metadata[key] = number(value)
        elif line.startswith("RV565_HEAP,"):
            parts = line.split(",")
            if len(parts) >= 4:
                entry: dict[str, object] = {"phase": parts[1], "kind": parts[2]}
                entry.update(
                    {key: number(value) for key, value in parse_key_values(",".join(parts[3:])).items()}
                )
                heaps.append(entry)
        elif line.startswith("RV565_SUMMARY,"):
            summary = {
                key: number(value)
                for key, value in parse_key_values(
                    line[len("RV565_SUMMARY,") :]
                ).items()
            }
        elif line.startswith("RV565_FRAME,"):
            values = line.split(",")[1:]
            if len(values) == len(FRAME_COLUMNS):
                frames.append(
                    {key: int(value) for key, value in zip(FRAME_COLUMNS, values)}
                )

    if summary is None:
        raise SystemExit("Capture contained no RV565_SUMMARY record")
    expected = int(metadata.get("sample_frames", summary.get("frames", 0)))
    if expected <= 0 or len(frames) != expected:
        raise SystemExit(f"Expected {expected} frame records but captured {len(frames)}")
    if [frame["sequence"] for frame in frames] != list(range(expected)):
        raise SystemExit("Frame sequence is incomplete or out of order")

    timing: dict[str, dict[str, float]] = {}
    for field in ("inflate_us", "scale_us", "dma_wait_us", "lcd_us", "work_us"):
        values = [frame[field] for frame in frames]
        timing[field] = {
            "mean": sum(values) / len(values),
            "p50": percentile(values, 0.50),
            "p95": percentile(values, 0.95),
            "p99": percentile(values, 0.99),
            "maximum": float(max(values)),
        }

    return {
        "metadata": metadata,
        "heap": heaps,
        "summary": summary,
        "timing_us": timing,
        "frames": frames,
    }


def main() -> int:
    args = parse_args()
    if args.baud <= 0 or args.timeout <= 0:
        raise SystemExit("--baud and --timeout must be positive")
    lines = capture(args)
    parsed = parse_capture(lines)

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"video-benchmark-{args.label}-{stamp}"
    raw_path = output_dir / f"{stem}.log"
    csv_path = output_dir / f"{stem}.csv"
    json_path = output_dir / f"{stem}.json"

    raw_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=FRAME_COLUMNS)
        writer.writeheader()
        writer.writerows(parsed.pop("frames"))

    artifacts = {
        "application": BENCHMARK_DIR / "build/oreo_video_dma.bin",
        "media": BENCHMARK_DIR / "main/video.rv565",
        "sdkconfig": BENCHMARK_DIR / "sdkconfig",
        "benchmark_source": BENCHMARK_DIR / "main/main.c",
        "sdkconfig_defaults": BENCHMARK_DIR / "sdkconfig.defaults",
        "collector_source": Path(__file__).resolve(),
    }
    record = {
        "collector_schema_version": 1,
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "label": args.label,
        "port": args.port,
        "baud": args.baud,
        "repository": git_metadata(),
        "artifacts": {
            name: {"path": str(path.relative_to(REPO_ROOT)), "sha256": sha256(path)}
            for name, path in artifacts.items()
        },
        **parsed,
        "frame_csv": csv_path.name,
        "raw_log": raw_path.name,
    }
    json_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    work = record["timing_us"]["work_us"]
    summary = record["summary"]
    print("\nValidated benchmark result")
    print(f"  FPS:       {summary['fps']}")
    print(f"  Drops:     {summary['drops']}")
    print(f"  Work p50:  {work['p50'] / 1000:.3f} ms")
    print(f"  Work p95:  {work['p95'] / 1000:.3f} ms")
    print(f"  Work p99:  {work['p99'] / 1000:.3f} ms")
    print(f"  Raw log:   {raw_path}")
    print(f"  Frame CSV: {csv_path}")
    print(f"  Summary:   {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
